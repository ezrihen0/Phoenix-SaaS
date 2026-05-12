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
  UseGuards,
} from "@nestjs/common";

import { SessionGuard } from "../auth/session.guard";
import { requirePermission } from "../auth/permissions";
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { PricebookService } from "./pricebook.service";
import {
  parseCreatePricebookBundleItemPayload,
  parseCreatePricebookBundlePayload,
  parseCreatePricebookItemPayload,
  parsePricebookBundleListQuery,
  parsePricebookItemListQuery,
  parseUpdatePricebookBundleItemPayload,
  parseUpdatePricebookBundlePayload,
  parseUpdatePricebookItemPayload,
  parseUuidParam,
} from "./validation";

@UseGuards(SessionGuard)
@Controller("api/pricebook")
export class PricebookController {
  constructor(private readonly pricebookService: PricebookService) {}

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
    const actor = this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.createItem(
        this.requireOrganizationId(actor),
        parseCreatePricebookItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_item_invalid");
    }
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
    const actor = this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.updateItem(
        this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.duplicateItem(
      this.requireOrganizationId(actor),
      parseUuidParam(itemId, "itemId"),
      actor.user.id,
    ));
  }

  @Delete("items/:itemId")
  async archiveItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const actor = this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.archiveItem(
      this.requireOrganizationId(actor),
      parseUuidParam(itemId, "itemId"),
      actor.user.id,
    ));
  }

  @Post("items/:itemId/restore")
  async restoreItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const actor = this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.restoreItem(
      this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.createBundle(
        this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundle(
        this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.archiveBundle(
      this.requireOrganizationId(actor),
      parseUuidParam(bundleId, "bundleId"),
      actor.user.id,
    ));
  }

  @Post("bundles/:bundleId/restore")
  async restoreBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    const actor = this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.restoreBundle(
      this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.addItemToBundle(
        this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundleItem(
        this.requireOrganizationId(actor),
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
    const actor = this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.removeBundleItem(
      this.requireOrganizationId(actor),
      parseUuidParam(bundleId, "bundleId"),
      parseUuidParam(bundleItemId, "bundleItemId"),
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

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for pricebook.");
    }

    return organizationId;
  }
}