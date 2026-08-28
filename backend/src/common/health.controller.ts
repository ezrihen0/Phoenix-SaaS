import { Controller, Get } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { apiSuccess } from "./api-response";

@Controller("api/health")
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async getHealth() {
    const checks: Record<string, "ok" | "fail"> = {
      process: "ok",
      database: "fail",
    };

    try {
      await this.dataSource.query("SELECT 1");
      checks.database = "ok";
    } catch {
      checks.database = "fail";
    }

    const ok = Object.values(checks).every((status) => status === "ok");

    return apiSuccess({
      status: ok ? "ok" : "degraded",
      service: "wizfield-backend",
      node_env: process.env.NODE_ENV ?? "development",
      checks,
      runtime: {
        uptime_seconds: Math.floor(process.uptime()),
        pid: process.pid,
      },
    });
  }
}
