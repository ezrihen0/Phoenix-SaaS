import "./load-env";
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import type { CustomOrigin } from "@nestjs/common/interfaces/external/cors-options.interface";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { assertProductionConfigValid } from "./config/production-config.validator";

function parseCorsOrigins(value: string | undefined) {
  if (!value) {
    return ["http://localhost:3000", "http://localhost:3001"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isDevLanOrigin(origin: string) {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?$/i.test(origin);
}

function isAllowedCorsOrigin(origin: string | undefined, allowedOrigins: string[]) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return process.env.NODE_ENV !== "production" && isDevLanOrigin(origin);
}

async function bootstrap() {
  if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "production") {
    assertProductionConfigValid(process.env);
  }

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const configService = app.get(ConfigService);
  const port = Number(process.env.PORT ?? configService.get<string>("BACKEND_PORT") ?? "4000");
  const corsOrigins = parseCorsOrigins(configService.get<string>("CORS_ORIGIN"));

  console.log(`WizField backend listening on port ${port}`);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: false,
      disableErrorMessages: false,
    }),
  );

  const corsOrigin: CustomOrigin = (origin, callback) => {
    if (isAllowedCorsOrigin(origin, corsOrigins)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin ?? "unknown"} is not allowed by CORS`), false);
  };

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
