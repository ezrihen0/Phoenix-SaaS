import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { JobEntity } from "../database/entities/job.entity";
import { TechnicianEntity } from "../database/entities/technician.entity";
import {
  classifyJobChangeForTechnicianPush,
  classifyJobNoteForTechnicianPush,
  type JobPushSnapshot,
  type TechnicianJobPushMessage,
} from "./job-technician-push.classifier";
import { WebPushDeliveryService } from "./web-push-delivery.service";

function toPushSnapshot(job: JobEntity | JobPushSnapshot): JobPushSnapshot {
  return {
    id: job.id,
    title: job.title,
    description: job.description,
    assigned_technician_id: job.assigned_technician_id,
    service_id: job.service_id,
    status: job.status,
    service_address_line_1: job.service_address_line_1,
    service_address_line_2: job.service_address_line_2,
    service_city: job.service_city,
    service_state_or_region: job.service_state_or_region,
    service_postal_code: job.service_postal_code,
    scheduled_for: job.scheduled_for,
    scheduled_window: job.scheduled_window,
  };
}

@Injectable()
export class TechnicianJobPushService {
  constructor(
    @InjectRepository(TechnicianEntity)
    private readonly techniciansRepository: Repository<TechnicianEntity>,
    private readonly webPushDeliveryService: WebPushDeliveryService,
  ) {}

  private async resolveAssigneeAuthUserId(
    organizationId: string,
    technicianId: string | null | undefined,
  ): Promise<string | null> {
    if (!technicianId) {
      return null;
    }

    const technician = await this.techniciansRepository.findOne({
      where: {
        id: technicianId,
        organization_id: organizationId,
      },
    });

    return technician?.auth_user_id?.trim() || null;
  }

  private shouldSkipForActor(assigneeAuthUserId: string | null, actorAuthUserId: string | null | undefined) {
    if (!assigneeAuthUserId || !actorAuthUserId) {
      return false;
    }

    return assigneeAuthUserId === actorAuthUserId;
  }

  private async deliver(
    organizationId: string,
    technicianId: string | null | undefined,
    actorAuthUserId: string | null | undefined,
    message: TechnicianJobPushMessage | null,
  ): Promise<void> {
    if (!message || !technicianId) {
      return;
    }

    const assigneeAuthUserId = await this.resolveAssigneeAuthUserId(organizationId, technicianId);

    if (!assigneeAuthUserId || this.shouldSkipForActor(assigneeAuthUserId, actorAuthUserId)) {
      return;
    }

    await this.webPushDeliveryService.sendToUserSubscriptions(
      organizationId,
      assigneeAuthUserId,
      message,
    );
  }

  async notifyJobCreated(
    organizationId: string,
    job: JobEntity,
    actorAuthUserId: string,
  ): Promise<void> {
    const message = classifyJobChangeForTechnicianPush({
      before: null,
      after: toPushSnapshot(job),
    });

    await this.deliver(organizationId, job.assigned_technician_id, actorAuthUserId, message);
  }

  async notifyJobUpdated(
    organizationId: string,
    before: JobEntity,
    after: JobEntity,
    actorAuthUserId: string,
  ): Promise<void> {
    const message = classifyJobChangeForTechnicianPush({
      before: toPushSnapshot(before),
      after: toPushSnapshot(after),
    });

    await this.deliver(organizationId, after.assigned_technician_id, actorAuthUserId, message);
  }

  async notifyJobStatusUpdated(
    organizationId: string,
    before: JobEntity,
    after: JobEntity,
    actorAuthUserId: string,
  ): Promise<void> {
    const message = classifyJobChangeForTechnicianPush({
      before: toPushSnapshot(before),
      after: toPushSnapshot(after),
    });

    await this.deliver(organizationId, after.assigned_technician_id, actorAuthUserId, message);
  }

  async notifyJobNoteCreated(input: {
    organizationId: string;
    job: JobEntity;
    actorAuthUserId: string;
    findings: string | null;
    recommendations: string | null;
  }): Promise<void> {
    const message = classifyJobNoteForTechnicianPush({
      jobId: input.job.id,
      jobTitle: input.job.title,
      findings: input.findings,
      recommendations: input.recommendations,
    });

    await this.deliver(
      input.organizationId,
      input.job.assigned_technician_id,
      input.actorAuthUserId,
      message,
    );
  }
}
