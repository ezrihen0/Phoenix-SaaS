import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import type { Request, Response } from "express";
import { DataSource, EntityManager, IsNull, MoreThan, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import type { ProfileRole } from "../crm/constants";
import { listPermissionsForRole } from "./permissions";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { MembershipEntity } from "../database/entities/membership.entity";
import { OrganizationEntity } from "../database/entities/organization.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { UserEntity } from "../database/entities/user.entity";

const DEFAULT_ORGANIZATION_NAME = "Phoenix Chimney & Fireplace";
const DEFAULT_ORGANIZATION_SLUG = "phoenix";
const LEGACY_ORGANIZATION_SLUG = "phoenix-default";

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
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async ensureBootstrapAdmin() {
    const adminEmail = (this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_EMAIL") ?? "admin@phoenixcrm.local").trim().toLowerCase();
    const adminPassword = this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_PASSWORD") ?? "Admin12345!";
    const adminName = this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_NAME") ?? "Phoenix Admin";
    const defaultOrganization = await this.ensureDefaultOrganization();

    if (!adminEmail || !adminPassword) {
      return;
    }

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

    const actor = await this.loadActorContextByUserId(user.id);

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

    membership.role = role;
    await this.membershipsRepository.save(membership);

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

    if (!session.active_organization_id && actor.organization_id) {
      session.active_organization_id = actor.organization_id;
      await this.sessionsRepository.save(session);
    }

    return actor;
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

  clearSessionCookie(response: Response) {
    response.clearCookie(this.getSessionCookieName(), {
      httpOnly: true,
      sameSite: "lax",
      secure: this.isSessionCookieSecure(),
      path: "/",
    });
  }

  private async loadActorContextByUserId(
    userId: string,
    preferredOrganizationId: string | null = null,
    requireExactPreferredOrganization = false,
  ): Promise<ActorContext | null> {
    const [user, profile, technician] = await Promise.all([
      this.usersRepository.findOne({ where: { id: userId } }),
      this.profilesRepository.findOne({ where: { auth_user_id: userId } }),
      this.techniciansRepository.findOne({
        where: [
          { auth_user_id: userId },
          { auth_user_id: IsNull() },
        ],
        order: {
          auth_user_id: "DESC",
        },
      }),
    ]);

    if (!user) {
      return null;
    }

    let memberships = await this.membershipsRepository.find({
      where: {
        user_id: userId,
        status: "active",
      },
      relations: {
        organization: true,
      },
      order: {
        created_at: "ASC",
      },
    });

    if (memberships.length === 0 && profile) {
      const defaultOrganization = await this.ensureDefaultOrganization();
      await this.ensureMembershipForUser(userId, profile.role, defaultOrganization.id);
      memberships = await this.membershipsRepository.find({
        where: {
          user_id: userId,
          status: "active",
        },
        relations: {
          organization: true,
        },
        order: {
          created_at: "ASC",
        },
      });
    }

    if (memberships.length === 0) {
      return null;
    }

    const preferredMembership = preferredOrganizationId
      ? memberships.find((item) => item.organization_id === preferredOrganizationId) ?? null
      : null;

    if (requireExactPreferredOrganization && preferredOrganizationId && !preferredMembership) {
      return null;
    }

    const membership = preferredMembership
      ?? (memberships.length === 1 ? memberships[0] : null);
    const organization = membership?.organization ?? null;
    const role = membership?.role ?? null;

    return {
      user,
      profile,
      technician: technician?.auth_user_id === userId ? technician : null,
      memberships,
      membership,
      organization,
      membership_id: membership?.id ?? null,
      organization_id: membership?.organization_id ?? null,
      role,
      permissions: listPermissionsForRole(role),
    };
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

  private getSessionCookieName() {
    return this.configService.get<string>("SESSION_COOKIE_NAME") ?? "phoenix_session";
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
}
