import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { SessionGuard } from "../auth/session.guard";
import { PhoenixFieldReportAccessGuard } from "./phoenix-field-report-access.guard";
import { PhoenixFieldReportPreviewService } from "./phoenix-field-report-preview.service";
import { PhoenixFieldReportService } from "./phoenix-field-report.service";
import { parseMichaelReportDraftBody } from "./phoenix-field-report-validation";

@Controller("api/phoenix-field-report")
@UseGuards(SessionGuard, PhoenixFieldReportAccessGuard)
export class PhoenixFieldReportController {
  constructor(
    private readonly reportService: PhoenixFieldReportService,
    private readonly previewService: PhoenixFieldReportPreviewService,
  ) {}

  @Get("status")
  async getStatus(@Req() request: RequestWithActor) {
    const data = await this.reportService.getFeatureStatus(request.actor!);
    return apiSuccess(data);
  }

  @Get("draft")
  async getDraft(@Req() request: RequestWithActor) {
    const data = await this.reportService.getDraft(request.actor!);
    return apiSuccess(data);
  }

  @Put("draft")
  async saveDraft(@Req() request: RequestWithActor, @Body() body: unknown) {
    const payload = parseMichaelReportDraftBody(body);
    const data = await this.reportService.saveDraft(request.actor!, payload);
    return apiSuccess(data);
  }

  @Post("preview")
  async preview(@Req() request: RequestWithActor, @Body() body: unknown) {
    const payload = parseMichaelReportDraftBody(body, { requirePartsCostConfirmed: true });
    const data = await this.previewService.preview(request.actor!, payload);
    return apiSuccess(data);
  }

  @Post("submit")
  async submit(
    @Req() request: RequestWithActor,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const payload = parseMichaelReportDraftBody(body, {
      requireReportEmail: true,
      requirePartsCostConfirmed: true,
    });
    const data = await this.reportService.submit(
      request.actor!,
      payload,
      idempotencyKey ?? "",
    );
    return apiSuccess(data);
  }

  @Post("batches/:batchId/retry-email")
  async retryEmail(@Req() request: RequestWithActor, @Param("batchId") batchId: string) {
    const data = await this.reportService.retryEmail(request.actor!, batchId);
    return apiSuccess(data);
  }

  @Post("batches/:batchId/verify-email-delivery")
  async verifyEmailDelivery(@Req() request: RequestWithActor, @Param("batchId") batchId: string) {
    const data = await this.reportService.verifyEmailDelivery(request.actor!, batchId);
    return apiSuccess(data);
  }

  @Post("batches/:batchId/close-feature")
  async closeFeature(@Req() request: RequestWithActor, @Param("batchId") batchId: string) {
    const data = await this.reportService.closeFeature(request.actor!, batchId);
    return apiSuccess(data);
  }

  @Post("batches/:batchId/retry-failed-imports")
  async retryFailedImports(@Req() request: RequestWithActor, @Param("batchId") batchId: string) {
    const data = await this.reportService.retryFailedImports(request.actor!, batchId);
    return apiSuccess(data);
  }

  @Get("batches/:batchId/pdf")
  async downloadPdf(
    @Req() request: RequestWithActor,
    @Param("batchId") batchId: string,
    @Res() response: Response,
  ) {
    const pdf = await this.reportService.getPdfBuffer(request.actor!, batchId);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="phoenix-field-report-${batchId.slice(0, 8)}.pdf"`,
    );
    response.send(pdf);
  }
}
