import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import type { Request, Response } from "express";
import { DataSource, EntityManager, IsNull, LessThanOrEqual, MoreThan, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { OrganizationBillingService } from "../billing/organization-billing.service";
import { resolveOrganizationLimitForPlan } from "../billing/billing.constants";
import type { ActorContext } from "../common/request-types";
import type { ProfileRole } from "../crm/constants";
import { BillingAccountEntity } from "../database/entities/billing-account.entity";
import {
  isProductionNodeEnv,
  resolveBootstrapDecision,
  shouldAutoAttachDefaultOrganizationMembership,
  shouldWarnAboutDefaultBootstrapCredentials,
} from "./bootstrap-auth.policy";
import {
  rankMembershipsForDefaultSelection,
  shouldBlockBootstrapOrganizationSwitch,
  shouldRepairBootstrapOrganizationPreference,
} from "./organization-resolution.policy";
import {
  hasPlatformCapability,
  isPlatformCapability,
  type PlatformCapability,
} from "../platform/platform-operator.policy";
import { listPermissionsForRole } from "./permissions";
import { listPermissionsForMembership } from "../team/membership-permissions";
import { assertOrganizationSeatAvailable } from "../team/team-seat-enforcement";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { ControlledAccessGrantEntity } from "../database/entities/controlled-access-grant.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { OrganizationBillingEntity } from "../database/entities/organization-billing.entity";
import { PlatformOperatorGrantEntity } from "../database/entities/platform-operator-grant.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { UserEntity } from "../database/entities/user.entity";

const DEFAULT_ORGANIZATION_NAME = "Phoenix Chimney & Fireplace";
const DEFAULT_ORGANIZATION_SLUG = "phoenix";
const LEGACY_ORGANIZATION_SLUG = "phoenix-default";
const accessEligibleBillingStatuses = new Set(["active", "trialing"]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profilesRepository: Repository<ProfileEntity>,
    @InjectRepository(TechnicianEntity)
    private readonly techniciansRepository: Repository<TechnicianEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationsRepository: Repository<OrganizationEntity>,
    @InjectRepository(MembershipEntity)
    private readonly membershipsRepository: Repository<MembershipEntity>,
    @InjectRepository(AuthSessionEntity)
    private readonly sessionsRepository: Repository<AuthSessionEntity>,
    @InjectRepository(ControlledAccessGrantEntity)
    private readonly controlledAccessGrantsRepository: Repository<ControlledAccessGrantEntity>,
    @InjectRepository(PlatformOperatorGrantEntity)
    private readonly platformOperatorGrantsRepository: Repository<PlatformOperatorGrantEntity>,
    private readonly organizationBillingService: OrganizationBillingService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async ensureBootstrapAdmin() {
    const decision = resolveBootstrapDecision({
      nodeEnv: this.configService.get<string>("NODE_ENV") ?? process.env.NODE_ENV,
      bootstrapEnabled: this.configService.get<string>("BACKEND_BOOTSTRAP_ENABLED"),
      adminEmail: this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_EMAIL"),
      adminPassword: this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_PASSWORD"),
      adminName: this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_NAME"),
    });

    if (decision.action === "skip") {
      if (isProductionNodeEnv(this.configService.get<string>("NODE_ENV") ?? process.env.NODE_ENV)) {
        this.logger.log(`Bootstrap admin skipped in production (${decision.reason}).`);
      }
      return;
    }

    const { adminEmail, adminPassword, adminName } = decision;

    if (shouldWarnAboutDefaultBootstrapCredentials(
      this.configService.get<string>("NODE_ENV") ?? process.env.NODE_ENV,
      adminEmail,
      adminPassword,
    )) {
      this.logger.warn(
        `Bootstrap admin is using known default credentials for ${adminEmail}. `
        + "Change BACKEND_BOOTSTRAP_ADMIN_EMAIL and BACKEND_BOOTSTRAP_ADMIN_PASSWORD before any shared or production-like deployment.",
      );
    }

    const defaultOrganization = await this.ensureDefaultOrganization();

    const existingUser = await this.usersRepository.findOne({
      where: {
        email: adminEmail,
      },
    });

    if (existingUser) {
      const existingProfile = await this.profilesRepository.findOne({
        where: {
          auth_user_id: existingUser.id,
        },
      });

      if (!existingProfile) {
        await this.profilesRepository.save(
          this.profilesRepository.create({
            auth_user_id: existingUser.id,
            full_name: adminName,
            phone: null,
            role: "owner",
          }),
        );
      } else if (existingProfile.role === "office_admin") {
        existingProfile.role = "owner";
        await this.profilesRepository.save(existingProfile);
        this.logger.log(`Bootstrap admin promoted to owner for ${adminEmail}`);
      }

      await this.ensureMembershipForUser(
        existingUser.id,
        existingProfile?.role ?? "owner",
        defaultOrganization.id,
      );

      return;
    }

    const password_hash = await bcrypt.hash(adminPassword, 10);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        email: adminEmail,
        password_hash,
        is_active: true,
      }),
    );

    await this.profilesRepository.save(
      this.profilesRepository.create({
        auth_user_id: user.id,
        full_name: adminName,
        phone: null,
        role: "owner",
      }),
    );

    await this.ensureMembershipForUser(user.id, "owner", defaultOrganization.id);

    this.logger.log(`Bootstrap admin ensured for ${adminEmail}`);
  }

  async login(email: string, password: string, request: Request, response: Response) {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.usersRepository.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException({
        error: {
          code: "invalid_credentials",
          message: "The email or password is not valid.",
        },
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new UnauthorizedException({
        error: {
          code: "invalid_credentials",
          message: "The email or password is not valid.",
        },
      });
    }

    const actor = await this.resolveLoginActorContext(user.id);

    if (!actor?.organization_id) {
      throw new UnauthorizedException({
        error: {
          code: "organization_membership_missing",
          message: "This account is not assigned to an active organization yet.",
        },
      });
    }

    await this.createSession(user.id, actor.organization_id, request, response);

    return actor;
  }

  async register(
    input: {
      email: string;
      password: string;
      fullName: string;
      phone: string | null;
      organizationName: string;
    },
    request: Request,
    response: Response,
  ) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      apiError(409, "account_email_exists", "An account already exists for this email address.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const created = await this.dataSource.transaction(async (manager) => {
      const usersRepository = manager.getRepository(UserEntity);
      const profilesRepository = manager.getRepository(ProfileEntity);
      const billingAccountsRepository = manager.getRepository(BillingAccountEntity);
      const billingRepository = manager.getRepository(OrganizationBillingEntity);
      const organization = await this.createOrganization(manager, input.organizationName);
      const user = await usersRepository.save(
        usersRepository.create({
          email: normalizedEmail,
          password_hash: passwordHash,
          is_active: true,
        }),
      );

      await profilesRepository.save(
        profilesRepository.create({
          auth_user_id: user.id,
          full_name: input.fullName,
          phone: input.phone,
          role: "owner",
        }),
      );

      await this.ensureMembershipForUser(user.id, "owner", organization.id, manager);

      const billingAccount = await billingAccountsRepository.save(
        billingAccountsRepository.create({
          owner_user_id: user.id,
          anchor_organization_id: organization.id,
          plan_key: "starter",
          billing_status: "trialing",
          organization_limit: resolveOrganizationLimitForPlan("starter"),
          billing_provider: null,
          provider_customer_id: null,
          provider_subscription_id: null,
          provider_price_id: null,
          clover_customer_id: null,
          clover_plan_id: null,
          clover_subscription_id: null,
          trial_starts_at: null,
          trial_ends_at: null,
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          canceled_at: null,
          deactivated_at: null,
          last_clover_sync_at: null,
          last_provider_sync_at: null,
          last_webhook_at: null,
          attention_reason: null,
        }),
      );

      await billingRepository.save(
        billingRepository.create(
          this.buildOrganizationBillingCoverage(organization.id, billingAccount),
        ),
      );

      return {
        userId: user.id,
        organizationId: organization.id,
      };
    });

    const actor = await this.loadActorContextByUserId(created.userId, created.organizationId, true);
    if (!actor?.organization_id) {
      apiError(500, "signup_state_invalid", "The account was created but no active organization could be loaded.");
    }

    await this.createSession(created.userId, created.organizationId, request, response);
    return actor;
  }

  async createOrganizationForActiveAccount(
    actor: ActorContext,
    organizationName: string,
    request: Request,
  ) {
    const currentOrganizationId = actor.organization_id;
    if (!currentOrganizationId) {
      apiError(400, "organization_context_missing", "An active organization is required to add a business.");
    }

    const billingContext = await this.organizationBillingService.getOrCreateContextForOrganization(currentOrganizationId);
    const created = await this.dataSource.transaction(async (manager) => {
      const billingAccountsRepository = manager.getRepository(BillingAccountEntity);
      const billingRepository = manager.getRepository(OrganizationBillingEntity);
      const billingAccount = await billingAccountsRepository.findOne({
        where: { id: billingContext.account.id },
      });

      if (!billingAccount) {
        apiError(404, "billing_account_not_found", "Billing account could not be found.");
      }

      const organizationLimit = billingAccount.organization_limit ?? resolveOrganizationLimitForPlan(billingAccount.plan_key);
      const bypassOrganizationLimit = hasPlatformCapability(actor, "organizations.create_unlimited");
      if (organizationLimit !== null && !bypassOrganizationLimit) {
        const coveredCount = await billingRepository.count({
          where: { billing_account_id: billingAccount.id },
        });
        if (coveredCount >= organizationLimit) {
          apiError(
            403,
            "organization_limit_reached",
            `The ${billingAccount.plan_key} plan currently allows up to ${organizationLimit} organization${organizationLimit === 1 ? "" : "s"} on this billing account.`,
          );
        }
      }

      const organization = await this.createOrganization(manager, organizationName);
      await this.ensureMembershipForUser(actor.user.id, "owner", organization.id, manager);

      await billingAccountsRepository.update(
        { id: billingAccount.id },
        { owner_user_id: actor.user.id },
      );

      await billingRepository.save(
        billingRepository.create(
          this.buildOrganizationBillingCoverage(organization.id, billingAccount),
        ),
      );

      return organization.id;
    });

    return this.switchActiveOrganization(request, actor.user.id, created);
  }

  async createStandaloneOrganizationForPlatformOperator(
    actor: ActorContext,
    organizationName: string,
    request: Request,
  ) {
    if (!hasPlatformCapability(actor, "organizations.create_standalone")) {
      apiError(
        403,
        "platform_capability_required",
        "Standalone organization creation requires a platform operator grant.",
      );
    }

    const createdOrganizationId = await this.dataSource.transaction(async (manager) => {
      const billingAccountsRepository = manager.getRepository(BillingAccountEntity);
      const billingRepository = manager.getRepository(OrganizationBillingEntity);
      const organization = await this.createOrganization(manager, organizationName);
      await this.ensureMembershipForUser(actor.user.id, "owner", organization.id, manager);

      const billingAccount = await billingAccountsRepository.save(
        billingAccountsRepository.create({
          owner_user_id: actor.user.id,
          anchor_organization_id: organization.id,
          plan_key: "starter",
          billing_status: "trialing",
          organization_limit: resolveOrganizationLimitForPlan("starter"),
          billing_provider: null,
          provider_customer_id: null,
          provider_subscription_id: null,
          provider_price_id: null,
          clover_customer_id: null,
          clover_plan_id: null,
          clover_subscription_id: null,
          trial_starts_at: null,
          trial_ends_at: null,
          current_period_start: null,
          current_period_end: null,
          cancel_at_period_end: false,
          canceled_at: null,
          deactivated_at: null,
          last_clover_sync_at: null,
          last_provider_sync_at: null,
          last_webhook_at: null,
          attention_reason: null,
        }),
      );

      await billingRepository.save(
        billingRepository.create(
          this.buildOrganizationBillingCoverage(organization.id, billingAccount),
        ),
      );

      if (this.isPlatformDevOrgGrantEnabled()) {
        await this.ensureDevControlledAccessGrant(manager, organization.id, actor.user.id);
      }

      return organization.id;
    });

    return this.switchActiveOrganization(request, actor.user.id, createdOrganizationId);
  }

  async createOrganizationForActor(
    actor: ActorContext,
    organizationName: string,
    request: Request,
    mode: "standalone" | "shared" = "shared",
  ) {
    if (mode === "standalone") {
      return this.createStandaloneOrganizationForPlatformOperator(actor, organizationName, request);
    }

    return this.createOrganizationForActiveAccount(actor, organizationName, request);
  }

  async logout(request: Request, response: Response) {
    const cookieName = this.getSessionCookieName();
    const token = request.cookies?.[cookieName] as string | undefined;

    if (token) {
      const session_token_hash = this.hashSessionToken(token);
      await this.sessionsRepository.delete({ session_token_hash });
    }

    this.clearSessionCookie(response);
  }

  async updatePassword(userId: string, nextPassword: string) {
    const user = await this.usersRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: "session_not_found",
          message: "Your session is no longer valid.",
        },
      });
    }

    user.password_hash = await bcrypt.hash(nextPassword, 10);
    await this.usersRepository.save(user);
  }

  async listStaffProfiles(actor: ActorContext) {
    if (!actor.organization_id) {
      return [];
    }

    const memberships = await this.membershipsRepository.find({
      where: {
        organization_id: actor.organization_id,
        status: "active",
      },
      relations: {
        user: true,
      },
      order: {
        created_at: "ASC",
      },
    });

    const userIds = memberships.map((membership) => membership.user_id);
    const profiles = userIds.length
      ? await this.profilesRepository.find({
        where: userIds.map((userId) => ({ auth_user_id: userId })),
      })
      : [];
    const profileMap = new Map(profiles.map((profile) => [profile.auth_user_id, profile]));

    return memberships
      .map((membership) => {
        const profile = profileMap.get(membership.user_id);

        if (!profile) {
          return null;
        }

        profile.user = membership.user;
        return this.buildStaffProfileResponse(profile, membership.role);
      })
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile));
  }

  async createStaffProfile(input: {
    email: string;
    password: string;
    fullName: string;
    phone: string | null;
    role: ProfileRole;
  }, actor: ActorContext) {
    const organizationId = actor.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required to create staff.");
    }

    const existingUser = await this.usersRepository.findOne({
      where: {
        email: input.email,
      },
    });

    if (existingUser) {
      apiError(409, "staff_email_exists", "A staff account already exists for this email.");
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const profile = await this.dataSource.transaction(async (manager) => {
      await assertOrganizationSeatAvailable(organizationId, manager);

      const membershipRepository = manager.getRepository(MembershipEntity);
      const profilesRepository = manager.getRepository(ProfileEntity);
      const user = await manager.getRepository(UserEntity).save(
        manager.getRepository(UserEntity).create({
          email: input.email,
          password_hash: passwordHash,
          is_active: true,
        }),
      );

      const createdProfile = await profilesRepository.save(
        profilesRepository.create({
          auth_user_id: user.id,
          full_name: input.fullName,
          phone: input.phone,
          role: input.role,
        }),
      );

      await membershipRepository.save(
        membershipRepository.create({
          user_id: user.id,
          organization_id: organizationId,
          role: input.role,
          status: "active",
        }),
      );

      return createdProfile;
    });

    const createdProfile = await this.profilesRepository.findOne({
      where: {
        id: profile.id,
      },
      relations: {
        user: true,
      },
    });

    if (!createdProfile) {
      apiError(500, "staff_create_failed", "The staff account was created but could not be loaded.");
    }

    return this.buildStaffProfileResponse(createdProfile, input.role);
  }

  async updateStaffRole(profileId: string, role: ProfileRole, actor: ActorContext) {
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", "An active organization is required to update staff roles.");
    }

    const profile = await this.profilesRepository.findOne({
      where: {
        id: profileId,
      },
      relations: {
        user: true,
      },
    });

    if (!profile) {
      apiError(404, "staff_profile_not_found", "The staff profile could not be found.");
    }

    const membership = await this.membershipsRepository.findOne({
      where: {
        user_id: profile.auth_user_id,
        organization_id: actor.organization_id,
        status: "active",
      },
    });

    if (!membership) {
      apiError(404, "staff_membership_not_found", "The staff member is not part of the active organization.");
    }

    if (membership.role === "owner" && role !== "owner") {
      const ownerCount = await this.membershipsRepository.count({
        where: {
          organization_id: actor.organization_id,
          role: "owner",
          status: "active",
        },
      });

      if (ownerCount <= 1) {
        apiError(403, "final_owner_protected", "The final owner cannot be removed or demoted.");
      }
    }

    if (role === "owner") {
      apiError(403, "owner_role_protected", "Ownership cannot be granted through this flow.");
    }

    membership.role = role;
    membership.custom_role_id = null;
    membership.custom_permission_keys = null;
    await this.membershipsRepository.save(membership);

    profile.role = role;
    await this.profilesRepository.save(profile);

    return this.buildStaffProfileResponse(profile, role);
  }

  async resolveActorFromRequest(request: Request): Promise<ActorContext | null> {
    const cookieName = this.getSessionCookieName();
    const token = request.cookies?.[cookieName] as string | undefined;

    if (!token) {
      return null;
    }

    return this.resolveActorFromToken(token);
  }

  async resolveActorFromToken(token: string): Promise<ActorContext | null> {
    const session_token_hash = this.hashSessionToken(token);
    const session = await this.sessionsRepository.findOne({
      where: {
        session_token_hash,
        expires_at: MoreThan(new Date()),
      },
    });

    if (!session) {
      return null;
    }

    const actor = await this.loadActorContextByUserId(session.user_id, session.active_organization_id);

    if (!actor) {
      return null;
    }

    const repairedActor = await this.repairBootstrapOrganizationActor(
      session.user_id,
      actor,
      session,
    );

    if (!session.active_organization_id && repairedActor.organization_id) {
      session.active_organization_id = repairedActor.organization_id;
      await this.sessionsRepository.save(session);
    } else if (
      session.active_organization_id
      && repairedActor.organization_id
      && session.active_organization_id !== repairedActor.organization_id
    ) {
      session.active_organization_id = repairedActor.organization_id;
      await this.sessionsRepository.save(session);
    }

    return repairedActor;
  }

  async switchActiveOrganization(request: Request, userId: string, organizationId: string) {
    const normalizedOrganizationId = organizationId.trim();

    if (!normalizedOrganizationId) {
      apiError(400, "organization_id_required", "organizationId is required.");
    }

    const cookieName = this.getSessionCookieName();
    const token = request.cookies?.[cookieName] as string | undefined;

    if (!token) {
      throw new UnauthorizedException({
        error: {
          code: "session_not_found",
          message: "Your session is no longer valid.",
        },
      });
    }

    const actor = await this.loadActorContextByUserId(userId, normalizedOrganizationId, true);

    if (!actor?.organization_id) {
      apiError(403, "organization_access_forbidden", "This account cannot switch to the requested organization.");
    }

    if (
      shouldBlockBootstrapOrganizationSwitch(actor.organization, actor.memberships ?? [])
    ) {
      apiError(
        403,
        "bootstrap_organization_switch_forbidden",
        "The bootstrap development workspace cannot be selected while an operating workspace is available.",
      );
    }

    const session = await this.sessionsRepository.findOne({
      where: {
        session_token_hash: this.hashSessionToken(token),
        user_id: userId,
        expires_at: MoreThan(new Date()),
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        error: {
          code: "session_not_found",
          message: "Your session is no longer valid.",
        },
      });
    }

    session.active_organization_id = actor.organization_id;
    await this.sessionsRepository.save(session);

    return actor;
  }

  async resolveClientDestination(actor: ActorContext) {
    const role = actor.role ?? actor.profile?.role ?? null;
    const organizationId = actor.organization_id?.trim() ?? null;

    if (!role) {
      return null;
    }

    if (!organizationId) {
      return "/home" as const;
    }

    const accessEligible = await this.isOrganizationOperationallyEligible(organizationId);
    if (!accessEligible) {
      return "/pricing" as const;
    }

    return "/home" as const;
  }

  buildSessionResponse(actor: ActorContext) {
    return {
      user: {
        id: actor.user.id,
        email: actor.user.email,
      },
      profile: actor.profile
        ? {
          id: actor.profile.id,
          full_name: actor.profile.full_name,
          phone: actor.profile.phone,
          role: (actor.role ?? actor.profile.role) as ProfileRole,
        }
        : null,
      technician: actor.technician
        ? {
          id: actor.technician.id,
          display_name: actor.technician.display_name,
          phone: actor.technician.phone,
          specialties: actor.technician.specialties,
          is_active: actor.technician.is_active,
          last_seen_at: actor.technician.last_seen_at ? actor.technician.last_seen_at.toISOString() : null,
        }
        : null,
      active_membership: actor.membership
        ? {
          id: actor.membership.id,
          organization_id: actor.membership.organization_id,
          role: actor.membership.role,
          status: actor.membership.status,
        }
        : null,
      active_organization: actor.organization
        ? {
          id: actor.organization.id,
          name: actor.organization.name,
          slug: actor.organization.slug,
          is_active: actor.organization.is_active,
        }
        : null,
      memberships: actor.memberships.map((membership) => ({
        id: membership.id,
        organization_id: membership.organization_id,
        role: membership.role,
        status: membership.status,
        organization: membership.organization
          ? {
            id: membership.organization.id,
            name: membership.organization.name,
            slug: membership.organization.slug,
            is_active: membership.organization.is_active,
          }
          : null,
      })),
      permissions: actor.permissions,
      platform_capabilities: actor.platform_capabilities,
    };
  }

  private async createSession(
    userId: string,
    activeOrganizationId: string | null,
    request: Request,
    response: Response,
  ) {
    const rawSessionToken = randomBytes(48).toString("hex");
    const session_token_hash = this.hashSessionToken(rawSessionToken);
    const ttlHours = this.getSessionTtlHours();
    const expires_at = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.sessionsRepository.insert({
      session_token_hash,
      user_id: userId,
      active_organization_id: activeOrganizationId,
      expires_at,
      ip_address: request.ip ?? null,
      user_agent: request.get("user-agent") ?? null,
    });

    response.cookie(this.getSessionCookieName(), rawSessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isSessionCookieSecure(),
      expires: expires_at,
      path: "/",
    });
  }

  private async resolveLoginActorContext(userId: string): Promise<ActorContext | null> {
    const preferredOrganizationId = await this.loadLastActiveOrganizationPreference(userId);
    if (preferredOrganizationId) {
      const preferredActor = await this.loadActorContextByUserId(userId, preferredOrganizationId);
      if (preferredActor?.organization_id) {
        return this.repairBootstrapOrganizationActor(userId, preferredActor);
      }
    }

    const actor = await this.loadActorContextByUserId(userId);
    return actor ? this.repairBootstrapOrganizationActor(userId, actor) : null;
  }

  clearSessionCookie(response: Response) {
    response.clearCookie(this.getSessionCookieName(), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isSessionCookieSecure(),
      path: "/",
    });
  }

  private async repairBootstrapOrganizationActor(
    userId: string,
    actor: ActorContext,
    session: AuthSessionEntity | null = null,
  ): Promise<ActorContext> {
    if (
      !shouldRepairBootstrapOrganizationPreference(
        actor.organization,
        actor.memberships ?? [],
      )
    ) {
      return actor;
    }

    const ranked = rankMembershipsForDefaultSelection(
      (actor.memberships ?? []).filter((membership) => membership.status === "active"),
    );
    const replacement = ranked.find(
      (membership) => membership.organization_id !== actor.organization_id,
    );

    if (!replacement?.organization_id) {
      return actor;
    }

    const repaired = await this.loadActorContextByUserId(userId, replacement.organization_id);
    if (!repaired?.organization_id) {
      return actor;
    }

    if (session && session.active_organization_id !== repaired.organization_id) {
      session.active_organization_id = repaired.organization_id;
      await this.sessionsRepository.save(session);
    }

    this.logger.warn(
      `Repaired bootstrap organization session for user ${userId}: `
      + `${actor.organization?.slug ?? actor.organization_id} → ${repaired.organization?.slug ?? repaired.organization_id}`,
    );

    return repaired;
  }

  private async loadActorContextByUserId(
    userId: string,
    preferredOrganizationId: string | null = null,
    requireExactPreferredOrganization = false,
  ): Promise<ActorContext | null> {
    const [user, profile] = await Promise.all([
      this.usersRepository.findOne({ where: { id: userId } }),
      this.profilesRepository.findOne({ where: { auth_user_id: userId } }),
    ]);

    if (!user) {
      return null;
    }

    if (!user.is_active) {
      return null;
    }

    let memberships = await this.membershipsRepository.find({
      where: {
        user_id: userId,
        status: "active",
      },
      relations: {
        organization: true,
        custom_role: true,
      },
      order: {
        created_at: "ASC",
      },
    });

    if (
      memberships.length === 0
      && profile
      && shouldAutoAttachDefaultOrganizationMembership(
        this.configService.get<string>("NODE_ENV") ?? process.env.NODE_ENV,
      )
    ) {
      const defaultOrganization = await this.ensureDefaultOrganization();
      await this.ensureMembershipForUser(userId, profile.role, defaultOrganization.id);
      memberships = await this.membershipsRepository.find({
        where: {
          user_id: userId,
          status: "active",
        },
        relations: {
          organization: true,
          custom_role: true,
        },
        order: {
          created_at: "ASC",
        },
      });
    }

    if (memberships.length === 0) {
      return null;
    }

    const eligibleMemberships = memberships.filter(
      (item) => item.organization?.is_active !== false,
    );
    const defaultMemberships = eligibleMemberships.length > 0 ? eligibleMemberships : memberships;
    const preferredMembership = preferredOrganizationId
      ? defaultMemberships.find((item) => item.organization_id === preferredOrganizationId) ?? null
      : null;

    if (requireExactPreferredOrganization && preferredOrganizationId && !preferredMembership) {
      return null;
    }

    const membership = preferredMembership
      ?? rankMembershipsForDefaultSelection(defaultMemberships)[0]
      ?? null;
    const organization = membership?.organization ?? null;
    const role = membership?.role ?? null;
    const organizationId = membership?.organization_id ?? null;

    let technician: TechnicianEntity | null = null;
    if (organizationId) {
      technician = await this.techniciansRepository.findOne({
        where: {
          auth_user_id: userId,
          organization_id: organizationId,
        },
      });
    }

    return {
      user,
      profile,
      technician,
      memberships,
      membership,
      organization,
      membership_id: membership?.id ?? null,
      organization_id: membership?.organization_id ?? null,
      role,
      permissions: listPermissionsForMembership(membership),
      platform_capabilities: await this.loadPlatformCapabilitiesForUser(userId),
    };
  }

  private async loadPlatformCapabilitiesForUser(userId: string): Promise<PlatformCapability[]> {
    const grants = await this.platformOperatorGrantsRepository.find({
      where: {
        user_id: userId,
        revoked_at: IsNull(),
      },
      order: {
        granted_at: "ASC",
      },
    });

    const capabilities = new Set<PlatformCapability>();
    for (const grant of grants) {
      if (isPlatformCapability(grant.capability)) {
        capabilities.add(grant.capability);
      }
    }

    return [...capabilities];
  }

  private isPlatformDevOrgGrantEnabled() {
    const raw = this.configService.get<string>("PLATFORM_DEV_ORG_GRANT_ENABLED")
      ?? process.env.PLATFORM_DEV_ORG_GRANT_ENABLED
      ?? "true";
    const normalized = raw.trim().toLowerCase();
    return ["true", "1", "yes", "on"].includes(normalized);
  }

  private async ensureDevControlledAccessGrant(
    manager: EntityManager,
    organizationId: string,
    createdByUserId: string | null,
  ) {
    const grantRepo = manager.getRepository(ControlledAccessGrantEntity);
    const now = new Date();
    const existing = await grantRepo.findOne({
      where: {
        organization_id: organizationId,
        starts_at: LessThanOrEqual(now),
        expires_at: MoreThan(now),
        revoked_at: IsNull(),
      },
      order: { created_at: "DESC" },
    });

    if (existing) {
      return existing;
    }

    const startsAt = new Date(now.getTime() - 60_000);
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    return grantRepo.save(
      grantRepo.create({
        organization_id: organizationId,
        grant_type: "owner_internal",
        reason_code: "platform_operator_standalone_org",
        starts_at: startsAt,
        expires_at: expiresAt,
        revoked_at: null,
        notes: "Development workspace created by platform operator",
        created_by_user_id: createdByUserId,
      }),
    );
  }

  private async loadLastActiveOrganizationPreference(userId: string): Promise<string | null> {
    const session = await this.sessionsRepository
      .createQueryBuilder("session")
      .select(["session.active_organization_id", "session.updated_at", "session.created_at"])
      .where("session.user_id = :userId", { userId })
      .andWhere("session.active_organization_id IS NOT NULL")
      .orderBy("session.updated_at", "DESC")
      .addOrderBy("session.created_at", "DESC")
      .getOne();

    const organizationId = session?.active_organization_id?.trim();
    return organizationId?.length ? organizationId : null;
  }

  private hashSessionToken(rawToken: string) {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  private buildStaffProfileResponse(profile: ProfileEntity, role: ProfileRole) {
    return {
      id: profile.id,
      auth_user_id: profile.auth_user_id,
      full_name: profile.full_name,
      phone: profile.phone,
      role,
      created_at: profile.created_at.toISOString(),
      updated_at: profile.updated_at.toISOString(),
      user: profile.user
        ? {
          id: profile.user.id,
          email: profile.user.email,
          is_active: profile.user.is_active,
        }
        : null,
    };
  }

  private async ensureDefaultOrganization(manager: EntityManager = this.dataSource.manager) {
    const organizationsRepository = manager.getRepository(OrganizationEntity);
    const existing = await organizationsRepository.findOne({
      where: {
        slug: DEFAULT_ORGANIZATION_SLUG,
      },
    });

    if (existing) {
      if (existing.name !== DEFAULT_ORGANIZATION_NAME || !existing.is_active) {
        existing.name = DEFAULT_ORGANIZATION_NAME;
        existing.is_active = true;
        return organizationsRepository.save(existing);
      }

      return existing;
    }

    const legacy = await organizationsRepository.findOne({
      where: {
        slug: LEGACY_ORGANIZATION_SLUG,
      },
    });

    if (legacy) {
      legacy.slug = DEFAULT_ORGANIZATION_SLUG;
      legacy.name = DEFAULT_ORGANIZATION_NAME;
      legacy.is_active = true;
      return organizationsRepository.save(legacy);
    }

    return organizationsRepository.save(
      organizationsRepository.create({
        name: DEFAULT_ORGANIZATION_NAME,
        slug: DEFAULT_ORGANIZATION_SLUG,
        is_active: true,
      }),
    );
  }

  private async ensureMembershipForUser(
    userId: string,
    role: ProfileRole,
    organizationId: string,
    manager: EntityManager = this.dataSource.manager,
  ) {
    const membershipsRepository = manager.getRepository(MembershipEntity);
    const existing = await membershipsRepository.findOne({
      where: {
        user_id: userId,
        organization_id: organizationId,
      },
    });

    if (existing) {
      return existing;
    }

    return membershipsRepository.save(
      membershipsRepository.create({
        user_id: userId,
        organization_id: organizationId,
        role,
        status: "active",
      }),
    );
  }

  private async createOrganization(
    manager: EntityManager,
    organizationName: string,
  ) {
    const organizationsRepository = manager.getRepository(OrganizationEntity);
    const normalizedName = organizationName.trim();
    const baseSlug = this.slugifyOrganizationName(normalizedName);
    let candidate = baseSlug;
    let suffix = 2;

    while (await organizationsRepository.findOne({ where: { slug: candidate } })) {
      candidate = this.appendSlugSuffix(baseSlug, suffix);
      suffix += 1;
    }

    return organizationsRepository.save(
      organizationsRepository.create({
        name: normalizedName,
        slug: candidate,
        is_active: true,
      }),
    );
  }

  private buildOrganizationBillingCoverage(
    organizationId: string,
    billingAccount: BillingAccountEntity,
  ) {
    return {
      organization_id: organizationId,
      billing_account_id: billingAccount.id,
      plan_key: billingAccount.plan_key,
      billing_status: billingAccount.billing_status,
      clover_customer_id: billingAccount.clover_customer_id,
      clover_plan_id: billingAccount.clover_plan_id,
      clover_subscription_id: billingAccount.clover_subscription_id,
      trial_starts_at: billingAccount.trial_starts_at,
      trial_ends_at: billingAccount.trial_ends_at,
      current_period_start: billingAccount.current_period_start,
      current_period_end: billingAccount.current_period_end,
      cancel_at_period_end: billingAccount.cancel_at_period_end,
      canceled_at: billingAccount.canceled_at,
      deactivated_at: billingAccount.deactivated_at,
      last_clover_sync_at: billingAccount.last_clover_sync_at,
      last_webhook_at: billingAccount.last_webhook_at,
      attention_reason: billingAccount.attention_reason,
    } satisfies Partial<OrganizationBillingEntity>;
  }

  private slugifyOrganizationName(value: string) {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return (slug || "workspace").slice(0, 160);
  }

  private appendSlugSuffix(baseSlug: string, suffix: number) {
    const normalizedBase = baseSlug.slice(0, 160);
    const suffixText = `-${suffix}`;
    const truncatedBase = normalizedBase.slice(0, Math.max(1, 160 - suffixText.length));
    return `${truncatedBase}${suffixText}`;
  }

  private getSessionCookieName() {
    return this.configService.get<string>("SESSION_COOKIE_NAME") ?? "wizfield_session";
  }

  private getSessionTtlHours() {
    const value = Number(this.configService.get<string>("SESSION_TTL_HOURS") ?? "168");

    if (!Number.isFinite(value) || value <= 0) {
      return 168;
    }

    return value;
  }

  private isSessionCookieSecure() {
    return (this.configService.get<string>("SESSION_COOKIE_SECURE") ?? "false").toLowerCase() === "true";
  }

  async isOrganizationOperationallyEligible(organizationId: string) {
    const context = await this.organizationBillingService.getOrCreateContextForOrganization(organizationId);
    const billingStatus = context.account.billing_status;

    if (accessEligibleBillingStatuses.has(billingStatus)) {
      return true;
    }

    return this.hasActiveControlledAccessGrant(organizationId);
  }

  private async hasActiveControlledAccessGrant(organizationId: string) {
    const now = new Date();
    const grant = await this.controlledAccessGrantsRepository.findOne({
      where: {
        organization_id: organizationId,
        starts_at: LessThanOrEqual(now),
        expires_at: MoreThan(now),
        revoked_at: IsNull(),
      },
      order: {
        created_at: "DESC",
      },
    });

    return Boolean(grant);
  }
}
