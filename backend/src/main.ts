import "dotenv/config";
import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";

function parseCorsOrigins(value: string | undefined) {
  if (!value) {
    return ["http://localhost:3001"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
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

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  await app.listen(port, "0.0.0.0");
}

void bootstrap();
