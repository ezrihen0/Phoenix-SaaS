import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

import { MarketingPublishExecutorService } from "./marketing-publish-executor.service";

@Injectable()
export class MarketingPublishDispatcherService {
  private readonly logger = new Logger(MarketingPublishDispatcherService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly executor: MarketingPublishExecutorService,
  ) {}

  private dispatcherEnabled(): boolean {
    const raw = this.configService.get<string>("MARKETING_PUBLISH_DISPATCHER_ENABLED");

    if (typeof raw !== "string") {
      return true;
    }

    const normalized = raw.trim().toLowerCase();

    return !["false", "0", "no", "off"].includes(normalized);
  }

  private leaseOwner(): string {
    return `${process.env.HOSTNAME ?? "wizfield"}:${process.pid}`;
  }

  @Cron("*/30 * * * * *")
  async dispatchCron(): Promise<void> {
    if (!this.dispatcherEnabled()) {
      return;
    }

    try {
      await this.reclaimStaleLeases();

      const maxJobs = 5;

      for (let i = 0; i < maxJobs; i++) {
        const jobId = await this.tryClaimNextJob();

        if (!jobId) {
          break;
        }

        try {
          await this.executor.executePublishJob(jobId);
        } catch {
          this.logger.warn(`Marketing publish job ${jobId} crashed during execution.`);

          await this.failJobCrash(jobId);
        }
      }
    } catch {
      this.logger.warn("Marketing publish dispatcher tick failed.");
    }
  }

  private async reclaimStaleLeases(): Promise<void> {
    await this.dataSource.query(`
      UPDATE marketing_publish_jobs
      SET status = 'queued',
          lease_owner = NULL,
          leased_until = NULL,
          updated_at = UTC_TIMESTAMP(6)
      WHERE status = 'running'
        AND leased_until IS NOT NULL
        AND leased_until < UTC_TIMESTAMP(6)
    `);
  }

  private async tryClaimNextJob(): Promise<string | null> {
    const leaseOwner = this.leaseOwner();

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `
          SELECT id FROM marketing_publish_jobs
          WHERE status = 'queued' AND scheduled_at <= UTC_TIMESTAMP(6)
          ORDER BY scheduled_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `,
      );

      if (!rows?.length) {
        return null;
      }

      const id = rows[0].id as string;

      await manager.query(
        `
          UPDATE marketing_publish_jobs
          SET status = 'running',
              lease_owner = ?,
              leased_until = DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 5 MINUTE),
              updated_at = UTC_TIMESTAMP(6)
          WHERE id = ?
        `,
        [leaseOwner, id],
      );

      return id;
    });
  }

  private async failJobCrash(jobId: string): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE marketing_publish_jobs
        SET status = 'failed',
            lease_owner = NULL,
            leased_until = NULL,
            updated_at = UTC_TIMESTAMP(6)
        WHERE id = ?
      `,
      [jobId],
    );
  }
}
