import {
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
  ArgumentsHost,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";

import { requirePermission } from "../auth/permissions";
import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { apiError, apiSuccess } from "../common/api-response";
import type { ActorContext, RequestWithActor } from "../common/request-types";
import { type InspectionItemStatus, inspectionItemStatuses } from "../database/entities/inspection-item.entity";
import { type InspectionReportType, inspectionReportTypes } from "../database/entities/inspection.entity";
import { ProfileEntity } from "../database/entities/profile.entity";
import {
  INSPECTION_PHOTO_MAX_FILE_SIZE_BYTES,
  INSPECTION_PHOTO_MAX_FILES_PER_REQUEST,
  INSPECTION_PHOTO_MAX_PHOTOS_PER_INSPECTION,
  INSPECTION_PHOTO_MAX_REQUEST_BYTES,
  InspectionsAdminService,
  validateInspectionPhotoUploadBatch,
  type InspectionPhotoUploadFile,
} from "./inspections.admin.service";

type CreateInspectionPayload = {
  source?: string;
  customer_id?: string;
  job_id?: string | null;
  report_type?: string;
  country_code?: string | null;
  region_code?: string | null;
  province_code?: string | null;
  state_code?: string | null;
  new_customer?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string | null;
    property_address?: string;
  };
  property_address?: string | null;
};

type PatchInspectionItemPayload = {
  status?: string;
  recommendation_text?: string | null;
};

type PatchRequiredFieldPayload = {
  field_value?: string | null;
  is_satisfied?: boolean;
};

type PatchInspectionMetaPayload = {
  gas_license_number?: string | null;
  gas_license_holder_name?: string | null;
};

type ArchiveInspectionPayload = {
  reasonCode?: string;
  reasonText?: string;
};

type AssignPhotoPayload = {
  photo_id?: string;
  item_id?: string;
  assignment_type?: "required_photo" | "unsatisfactory_evidence" | null;
  make_primary?: boolean;
};

@Catch()
class InspectionPhotoMulterExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (
      !exception
      || typeof exception !== "object"
      || !("code" in exception)
      || typeof (exception as { code: unknown }).code !== "string"
      || !(exception as { code: string }).code.startsWith("LIMIT_")
    ) {
      throw exception;
    }

    const response = host.switchToHttp().getResponse<Response>();
    const multerCode = (exception as { code: string }).code;
    const code = multerCode === "LIMIT_FILE_SIZE"
      ? "inspection_photo_too_large"
      : multerCode === "LIMIT_FILE_COUNT" || multerCode === "LIMIT_UNEXPECTED_FILE"
        ? "inspection_photo_count_exceeded"
        : "inspection_photo_upload_failed";
    const message = code === "inspection_photo_too_large"
      ? "Inspection photo exceeds the maximum allowed size."
      : code === "inspection_photo_count_exceeded"
        ? "Too many inspection photos were uploaded in one request."
        : "Inspection photo upload failed.";
    response.status(400).json({
      error: {
        code,
        message,
      },
    });
  }
}

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/inspections")
export class InspectionsAdminController {
  constructor(private readonly inspectionsAdminService: InspectionsAdminService) {}

  private requireOfficeActor(request: RequestWithActor): ActorContext & { profile: ProfileEntity } {
    return requirePermission(
      request.actor,
      "inspections.admin",
      "office_admin_required",
      "This endpoint is only available to office staff.",
    );
  }

  private requireCorrectionAdminActor(request: RequestWithActor): ActorContext & { profile: ProfileEntity } {
    return requirePermission(
      request.actor,
      "inspections.admin",
      "inspection_unlock_admin_required",
      "Only admins can unlock a sent inspection for correction.",
    );
  }

  private requireActiveOrganizationId(actor: ActorContext, message = "An active organization is required for inspections.") {
    if (!actor.organization_id) {
      apiError(400, "organization_context_missing", message);
    }
    return actor.organization_id;
  }

  @Post()
  async createInspection(@Req() request: RequestWithActor, @Body() body: CreateInspectionPayload) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    if (!body.report_type || !(inspectionReportTypes as readonly string[]).includes(body.report_type)) {
      apiError(400, "invalid_report_type", "report_type is invalid.");
    }

    const source = (body.source?.trim() || "existing_customer") as "new_customer" | "existing_customer" | "existing_job" | "internal_draft";

    if (source === "existing_customer" && !body.customer_id?.trim()) {
      apiError(400, "invalid_customer_id", "customer_id is required for existing_customer source.");
    }
    if (source === "existing_job" && !body.job_id?.trim()) {
      apiError(400, "invalid_job_id", "job_id is required for existing_job source.");
    }
    if (source === "new_customer") {
      const firstName = body.new_customer?.first_name?.trim();
      const lastName = body.new_customer?.last_name?.trim();
      const phone = body.new_customer?.phone?.trim();
      const propertyAddress = body.new_customer?.property_address?.trim();
      if (!firstName || !lastName || !phone || !propertyAddress) {
        apiError(400, "invalid_new_customer", "New customer requires first_name, last_name, phone, and property_address.");
      }
    }

    const workspace = await this.inspectionsAdminService.createInspection({
      source,
      customer_id: body.customer_id?.trim() || null,
      job_id: body.job_id?.trim() || null,
      report_type: body.report_type as InspectionReportType,
      new_customer: body.new_customer
        ? {
          first_name: body.new_customer.first_name?.trim() || "",
          last_name: body.new_customer.last_name?.trim() || "",
          phone: body.new_customer.phone?.trim() || "",
          email: body.new_customer.email?.trim() || null,
          property_address: body.new_customer.property_address?.trim() || "",
        }
        : null,
      property_address: body.property_address?.trim() || null,
      country_code: body.country_code?.trim() || null,
      region_code: body.region_code?.trim() || null,
      province_code: body.province_code?.trim() || null,
      state_code: body.state_code?.trim() || null,
      actor,
      organizationId,
    });

    return apiSuccess(workspace);
  }

  @Get("customers/search")
  async searchCustomers(@Req() request: RequestWithActor, @Query("q") query?: string) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const rows = await this.inspectionsAdminService.searchCustomers(query ?? "", organizationId);
    return apiSuccess(rows);
  }

  @Get("jobs/search")
  async searchJobs(@Req() request: RequestWithActor, @Query("q") query?: string) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const rows = await this.inspectionsAdminService.searchJobs(query ?? "", organizationId);
    return apiSuccess(rows);
  }

  @Get()
  async listInspections(
    @Req() request: RequestWithActor,
    @Query("q") query?: string,
    @Query("reportType") reportType?: string,
    @Query("status") status?: string,
    @Query("customerId") customerId?: string,
    @Query("activeState") activeState?: string,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const normalizedActiveState = activeState?.trim().toLowerCase();
    const activeStateFilter = normalizedActiveState === "archived" || normalizedActiveState === "all"
      ? normalizedActiveState
      : "active";
    const rows = await this.inspectionsAdminService.listInspections({
      query,
      report_type: reportType,
      status,
      customer_id: customerId,
      activeState: activeStateFilter,
      organizationId,
    });
    return apiSuccess(rows);
  }

  @Get(":inspectionId/workspace")
  async getWorkspace(@Req() request: RequestWithActor, @Param("inspectionId") inspectionId: string) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.getWorkspace(inspectionId, organizationId);
    return apiSuccess(workspace);
  }

  @Patch(":inspectionId/items/:itemId")
  async patchItem(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @Param("itemId") itemId: string,
    @Body() body: PatchInspectionItemPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    if (body.status && !(inspectionItemStatuses as readonly string[]).includes(body.status)) {
      apiError(400, "invalid_item_status", "status must be satisfactory, unsatisfactory, or na.");
    }

    const workspace = await this.inspectionsAdminService.patchItem(
      inspectionId,
      itemId,
      {
        status: body.status as InspectionItemStatus | undefined,
        recommendation_text: body.recommendation_text,
      },
      actor,
      organizationId,
    );
    return apiSuccess(workspace);
  }

  @Patch(":inspectionId/required-fields/:fieldId")
  async patchRequiredField(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @Param("fieldId") fieldId: string,
    @Body() body: PatchRequiredFieldPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.patchRequiredField(inspectionId, fieldId, body, organizationId);
    return apiSuccess(workspace);
  }

  @Patch(":inspectionId/meta")
  async patchInspectionMeta(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @Body() body: PatchInspectionMetaPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.patchInspectionMeta(inspectionId, body, organizationId);
    return apiSuccess(workspace);
  }

  @Post(":inspectionId/photos/assign")
  async assignPhoto(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @Body() body: AssignPhotoPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    if (!body.photo_id?.trim()) {
      apiError(400, "invalid_photo_id", "photo_id is required.");
    }
    if (!body.item_id?.trim()) {
      apiError(400, "invalid_item_id", "item_id is required.");
    }
    const workspace = await this.inspectionsAdminService.assignPhoto(
      inspectionId,
      body.photo_id.trim(),
      body.item_id.trim(),
      body.assignment_type ?? null,
      body.make_primary === true,
      organizationId,
    );
    return apiSuccess(workspace);
  }

  @Post(":inspectionId/photos/upload")
  @UseFilters(InspectionPhotoMulterExceptionFilter)
  @UseInterceptors(FilesInterceptor("files", INSPECTION_PHOTO_MAX_FILES_PER_REQUEST, {
    limits: {
      fileSize: INSPECTION_PHOTO_MAX_FILE_SIZE_BYTES,
      files: INSPECTION_PHOTO_MAX_FILES_PER_REQUEST,
    },
  }))
  async uploadPhotos(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @UploadedFiles() files: Array<{ originalname: string; mimetype: string; buffer: Buffer }>,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.uploadPhotos(inspectionId, files ?? [], organizationId);
    return apiSuccess(workspace);
  }

  @Get("photos/:fileName/asset")
  async getPhotoAsset(
    @Req() request: RequestWithActor,
    @Param("fileName") fileName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const stream = await this.inspectionsAdminService.getPhotoAssetStream(fileName, organizationId);
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".png")) response.setHeader("content-type", "image/png");
    else if (lower.endsWith(".webp")) response.setHeader("content-type", "image/webp");
    else response.setHeader("content-type", "image/jpeg");
    return new StreamableFile(stream);
  }

  @Post(":inspectionId/generate")
  async generate(@Req() request: RequestWithActor, @Param("inspectionId") inspectionId: string) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.generate(inspectionId, organizationId);
    return apiSuccess(workspace);
  }

  @Post(":inspectionId/send")
  async send(@Req() request: RequestWithActor, @Param("inspectionId") inspectionId: string) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.send(inspectionId, organizationId);
    return apiSuccess(workspace);
  }

  @Post(":inspectionId/unlock")
  async unlockForCorrection(@Req() request: RequestWithActor, @Param("inspectionId") inspectionId: string) {
    const actor = this.requireCorrectionAdminActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.unlockForCorrection(inspectionId, organizationId);
    return apiSuccess(workspace);
  }

  @Post(":inspectionId/archive")
  async archiveInspection(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @Body() body: ArchiveInspectionPayload,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    if (!body.reasonCode?.trim()) {
      apiError(400, "invalid_archive_reason_code", "reasonCode is required.");
    }
    if (!body.reasonText?.trim()) {
      apiError(400, "invalid_archive_reason", "reasonText is required.");
    }
    const workspace = await this.inspectionsAdminService.archiveInspection(
      inspectionId,
      {
        reasonCode: body.reasonCode.trim(),
        reasonText: body.reasonText.trim(),
      },
      actor,
      organizationId,
    );
    return apiSuccess(workspace);
  }

  @Post(":inspectionId/restore")
  async restoreInspection(@Req() request: RequestWithActor, @Param("inspectionId") inspectionId: string) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const workspace = await this.inspectionsAdminService.restoreInspection(inspectionId, actor, organizationId);
    return apiSuccess(workspace);
  }

  @Get(":inspectionId/pdf-preview")
  async pdfPreview(
    @Req() request: RequestWithActor,
    @Param("inspectionId") inspectionId: string,
    @Query("download") download: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = this.requireOfficeActor(request);
    const organizationId = this.requireActiveOrganizationId(actor);
    const pdfBuffer = await this.inspectionsAdminService.renderInspectionPdf(inspectionId, organizationId);
    const shouldDownload = download === "1" || download === "true";
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `${shouldDownload ? "attachment" : "inline"}; filename=\"inspection-${inspectionId}.pdf\"`,
    );
    return new StreamableFile(pdfBuffer);
  }
}
