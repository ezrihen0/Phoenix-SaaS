import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { OperationalAccessGuard } from "../auth/operational-access.guard";
import { SessionGuard } from "../auth/session.guard";
import { requirePermission } from "../auth/permissions";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { PricebookService } from "./pricebook.service";
import {
  parseCreatePricebookBundleItemPayload,
  parseCreatePricebookBundlePayload,
  parseCreatePricebookBundleRequirementPayload,
  parseCreatePricebookItemPayload,
  parsePricebookBundleListQuery,
  parsePricebookCategoryListQuery,
  parsePricebookItemListQuery,
  parsePricebookNavigationSummaryQuery,
  parseUpdatePricebookBundleItemPayload,
  parseUpdatePricebookBundlePayload,
  parseUpdatePricebookBundleRequirementPayload,
  parseUpdatePricebookItemPayload,
  parseUuidParam,
} from "./validation";

@UseGuards(SessionGuard, OperationalAccessGuard)
@Controller("api/pricebook")
export class PricebookController {
  constructor(private readonly pricebookService: PricebookService) {}

  @Get("systems")
  async listSystems(@Req() request: RequestWithActor) {
    const actor = this.requirePricebookViewer(request);
    return apiSuccess(await this.pricebookService.listSystems(this.requireOrganizationId(actor)));
  }

  @Post("bootstrap")
  async bootstrapCatalog(@Req() request: RequestWithActor) {
    const { actor, organizationId } = this.requirePricebookManage(request);
    return apiSuccess(await this.pricebookService.bootstrapCatalog(organizationId, actor.user.id));
  }

  @Get("categories")
  async listCategories(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requirePricebookViewer(request);

    try {
      return apiSuccess(await this.pricebookService.listCategories(
        this.requireOrganizationId(actor),
        parsePricebookCategoryListQuery(query),
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_categories_query_invalid");
    }
  }

  @Get("navigation-summary")
  async listNavigationSummary(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requirePricebookViewer(request);

    try {
      return apiSuccess(await this.pricebookService.listNavigationSummary(
        this.requireOrganizationId(actor),
        parsePricebookNavigationSummaryQuery(query),
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_navigation_summary_query_invalid");
    }
  }

  @Get("items")
  async listItems(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requirePricebookViewer(request);

    try {
      return apiSuccess(await this.pricebookService.listItems(
        this.requireOrganizationId(actor),
        parsePricebookItemListQuery(query),
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_items_query_invalid");
    }
  }

  @Post("items")
  async createItem(@Req() request: RequestWithActor, @Body() body: unknown) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.createItem(
        organizationId,
        parseCreatePricebookItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_item_invalid");
    }
  }

  @Get("items/:itemId/image")
  async getItemImage(
    @Req() request: RequestWithActor,
    @Param("itemId") itemId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = this.requirePricebookViewer(request);
    const image = await this.pricebookService.getItemImage(
      this.requireOrganizationId(actor),
      parseUuidParam(itemId, "itemId"),
    );
    response.setHeader("content-type", image.contentType);
    response.setHeader("cache-control", "private, max-age=300");
    return new StreamableFile(image.stream);
  }

  @Get("items/:itemId")
  async getItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const actor = this.requirePricebookViewer(request);

    return apiSuccess(await this.pricebookService.getItem(
      this.requireOrganizationId(actor),
      parseUuidParam(itemId, "itemId"),
    ));
  }

  @Patch("items/:itemId")
  async updateItem(
    @Req() request: RequestWithActor,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.updateItem(
        organizationId,
        parseUuidParam(itemId, "itemId"),
        parseUpdatePricebookItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_item_update_invalid");
    }
  }

  @Post("items/:itemId/duplicate")
  async duplicateItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.duplicateItem(
      organizationId,
      parseUuidParam(itemId, "itemId"),
      actor.user.id,
    ));
  }

  @Delete("items/:itemId")
  async archiveItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.archiveItem(
      organizationId,
      parseUuidParam(itemId, "itemId"),
      actor.user.id,
    ));
  }

  @Post("items/:itemId/restore")
  async restoreItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.restoreItem(
      organizationId,
      parseUuidParam(itemId, "itemId"),
      actor.user.id,
    ));
  }

  @Get("bundles")
  async listBundles(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requirePricebookViewer(request);

    try {
      return apiSuccess(await this.pricebookService.listBundles(
        this.requireOrganizationId(actor),
        parsePricebookBundleListQuery(query),
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundles_query_invalid");
    }
  }

  @Post("bundles")
  async createBundle(@Req() request: RequestWithActor, @Body() body: unknown) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.createBundle(
        organizationId,
        parseCreatePricebookBundlePayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_invalid");
    }
  }

  @Get("bundles/:bundleId")
  async getBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    const actor = this.requirePricebookViewer(request);

    return apiSuccess(await this.pricebookService.getBundle(
      this.requireOrganizationId(actor),
      parseUuidParam(bundleId, "bundleId"),
    ));
  }

  @Patch("bundles/:bundleId")
  async updateBundle(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Body() body: unknown,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundle(
        organizationId,
        parseUuidParam(bundleId, "bundleId"),
        parseUpdatePricebookBundlePayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_update_invalid");
    }
  }

  @Delete("bundles/:bundleId")
  async archiveBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.archiveBundle(
      organizationId,
      parseUuidParam(bundleId, "bundleId"),
      actor.user.id,
    ));
  }

  @Post("bundles/:bundleId/restore")
  async restoreBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.restoreBundle(
      organizationId,
      parseUuidParam(bundleId, "bundleId"),
      actor.user.id,
    ));
  }

  @Post("bundles/:bundleId/items")
  async addItemToBundle(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Body() body: unknown,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.addItemToBundle(
        organizationId,
        parseUuidParam(bundleId, "bundleId"),
        parseCreatePricebookBundleItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_item_invalid");
    }
  }

  @Patch("bundles/:bundleId/items/:bundleItemId")
  async updateBundleItem(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Param("bundleItemId") bundleItemId: string,
    @Body() body: unknown,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundleItem(
        organizationId,
        parseUuidParam(bundleId, "bundleId"),
        parseUuidParam(bundleItemId, "bundleItemId"),
        parseUpdatePricebookBundleItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_item_update_invalid");
    }
  }

  @Delete("bundles/:bundleId/items/:bundleItemId")
  async removeBundleItem(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Param("bundleItemId") bundleItemId: string,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.removeBundleItem(
      organizationId,
      parseUuidParam(bundleId, "bundleId"),
      parseUuidParam(bundleItemId, "bundleItemId"),
      actor.user.id,
    ));
  }

  @Get("bundles/:bundleId/requirements")
  async listBundleRequirements(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    const actor = this.requirePricebookViewer(request);

    return apiSuccess(await this.pricebookService.listBundleRequirements(
      this.requireOrganizationId(actor),
      parseUuidParam(bundleId, "bundleId"),
    ));
  }

  @Post("bundles/:bundleId/requirements")
  async addBundleRequirement(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Body() body: unknown,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.addBundleRequirement(
        organizationId,
        parseUuidParam(bundleId, "bundleId"),
        parseCreatePricebookBundleRequirementPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_requirement_invalid");
    }
  }

  @Patch("bundles/:bundleId/requirements/:requirementId")
  async updateBundleRequirement(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Param("requirementId") requirementId: string,
    @Body() body: unknown,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundleRequirement(
        organizationId,
        parseUuidParam(bundleId, "bundleId"),
        parseUuidParam(requirementId, "requirementId"),
        parseUpdatePricebookBundleRequirementPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_requirement_update_invalid");
    }
  }

  @Delete("bundles/:bundleId/requirements/:requirementId")
  async removeBundleRequirement(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Param("requirementId") requirementId: string,
  ) {
    const { actor, organizationId } = this.requirePricebookManage(request);

    return apiSuccess(await this.pricebookService.removeBundleRequirement(
      organizationId,
      parseUuidParam(bundleId, "bundleId"),
      parseUuidParam(requirementId, "requirementId"),
      actor.user.id,
    ));
  }

  private handleValidationError(error: unknown, code: string): never {
    if (error instanceof Error) {
      apiError(400, code, error.message);
    }

    throw error;
  }

  private requirePricebookViewer(request: RequestWithActor) {
    return requirePermission(
      request.actor,
      "pricebook.view",
      "pricebook_view_forbidden",
      "This account cannot view the pricebook.",
    );
  }

  private requirePricebookManager(request: RequestWithActor) {
    return requirePermission(
      request.actor,
      "pricebook.manage",
      "pricebook_manage_forbidden",
      "This account cannot change pricebook records.",
    );
  }

  private requirePricebookManage(request: RequestWithActor) {
    const actor = this.requirePricebookManager(request);
    const organizationId = this.requireOrganizationId(actor);
    return { actor, organizationId };
  }

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for pricebook.");
    }

    return organizationId;
  }
}