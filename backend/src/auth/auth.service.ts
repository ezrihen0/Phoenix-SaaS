import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { randomBytes, createHash } from "crypto";
import type { Request, Response } from "express";
import { DataSource, IsNull, MoreThan, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import type { ActorContext } from "../common/request-types";
import type { ProfileRole } from "../crm/constants";
import { AuthSessionEntity } from "../database/entities/auth-session.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import { UserEntity } from "../database/entities/user.entity";

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
    @InjectRepository(AuthSessionEntity)
    private readonly sessionsRepository: Repository<AuthSessionEntity>,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async ensureBootstrapAdmin() {
    const adminEmail = (this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_EMAIL") ?? "admin@phoenixcrm.local").trim().toLowerCase();
    const adminPassword = this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_PASSWORD") ?? "Admin12345!";
    const adminName = this.configService.get<string>("BACKEND_BOOTSTRAP_ADMIN_NAME") ?? "Phoenix Admin";

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

    await this.createSession(user.id, request, response);

    return this.loadActorContextByUserId(user.id);
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

  async listStaffProfiles() {
    const profiles = await this.profilesRepository.find({
      relations: {
        user: true,
      },
      order: {
        full_name: "ASC",
      },
    });

    return profiles.map((profile) => this.buildStaffProfileResponse(profile));
  }

  async createStaffProfile(input: {
    email: string;
    password: string;
    fullName: string;
    phone: string | null;
    role: ProfileRole;
  }) {
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
      const user = await manager.getRepository(UserEntity).save(
        manager.getRepository(UserEntity).create({
          email: input.email,
          password_hash: passwordHash,
          is_active: true,
        }),
      );

      return manager.getRepository(ProfileEntity).save(
        manager.getRepository(ProfileEntity).create({
          auth_user_id: user.id,
          full_name: input.fullName,
          phone: input.phone,
          role: input.role,
        }),
      );
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

    return this.buildStaffProfileResponse(createdProfile);
  }

  async updateStaffRole(profileId: string, role: ProfileRole) {
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

    profile.role = role;
    const updatedProfile = await this.profilesRepository.save(profile);
    updatedProfile.user = profile.user;

    return this.buildStaffProfileResponse(updatedProfile);
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

    const actor = await this.loadActorContextByUserId(session.user_id);

    if (!actor) {
      return null;
    }

    return actor;
  }

  private async createSession(userId: string, request: Request, response: Response) {
    const rawSessionToken = randomBytes(48).toString("hex");
    const session_token_hash = this.hashSessionToken(rawSessionToken);
    const ttlHours = this.getSessionTtlHours();
    const expires_at = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    await this.sessionsRepository.insert({
      session_token_hash,
      user_id: userId,
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

  private async loadActorContextByUserId(userId: string): Promise<ActorContext | null> {
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

    return {
      user,
      profile,
      technician: technician?.auth_user_id === userId ? technician : null,
    };
  }

  private hashSessionToken(rawToken: string) {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  private buildStaffProfileResponse(profile: ProfileEntity) {
    return {
      id: profile.id,
      auth_user_id: profile.auth_user_id,
      full_name: profile.full_name,
      phone: profile.phone,
      role: profile.role,
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
