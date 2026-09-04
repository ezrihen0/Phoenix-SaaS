import "dotenv/config";
import "reflect-metadata";

import * as bcrypt from "bcrypt";
import { DataSource } from "typeorm";

import { UserEntity } from "./entities/user.entity";
import { buildDataSourceOptions } from "./typeorm.config";
import {
  LEGACY_PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_EMAIL,
  PHOENIX_OWNER_PASSWORD,
} from "./phoenix-owner-credentials";

async function main() {
  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();

  try {
    const userRepo = dataSource.getRepository(UserEntity);

    const legacyUser = await userRepo.findOne({ where: { email: LEGACY_PHOENIX_OWNER_EMAIL } });
    const targetUser = await userRepo.findOne({ where: { email: PHOENIX_OWNER_EMAIL } });

    if (targetUser && legacyUser && targetUser.id !== legacyUser.id) {
      throw new Error(
        `Cannot migrate owner credentials: ${PHOENIX_OWNER_EMAIL} already belongs to a different user.`,
      );
    }

    const user = legacyUser ?? targetUser;
    if (!user) {
      throw new Error(
        `No Phoenix owner user found at ${LEGACY_PHOENIX_OWNER_EMAIL} or ${PHOENIX_OWNER_EMAIL}. Run phoenix:activate first.`,
      );
    }

    user.email = PHOENIX_OWNER_EMAIL;
    user.password_hash = await bcrypt.hash(PHOENIX_OWNER_PASSWORD, 10);
    user.is_active = true;
    await userRepo.save(user);

    console.log(JSON.stringify({
      ok: true,
      userId: user.id,
      previousEmail: legacyUser ? LEGACY_PHOENIX_OWNER_EMAIL : PHOENIX_OWNER_EMAIL,
      email: user.email,
      passwordUpdated: true,
    }, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
