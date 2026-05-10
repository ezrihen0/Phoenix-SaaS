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
    this.requirePricebookViewer(request);

    try {
      return apiSuccess(await this.pricebookService.listItems(parsePricebookItemListQuery(query)));
    } catch (error) {
      this.handleValidationError(error, "pricebook_items_query_invalid");
    }
  }

  @Post("items")
  async createItem(@Req() request: RequestWithActor, @Body() body: unknown) {
    this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.createItem(
        parseCreatePricebookItemPayload(body),
        request.actor?.user.id ?? null,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_item_invalid");
    }
  }

  @Get("items/:itemId")
  async getItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    this.requirePricebookViewer(request);

    return apiSuccess(await this.pricebookService.getItem(parseUuidParam(itemId, "itemId")));
  }

  @Patch("items/:itemId")
  async updateItem(
    @Req() request: RequestWithActor,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.updateItem(
        parseUuidParam(itemId, "itemId"),
        parseUpdatePricebookItemPayload(body),
        request.actor?.user.id ?? null,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_item_update_invalid");
    }
  }

  @Post("items/:itemId/duplicate")
  async duplicateItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.duplicateItem(
      parseUuidParam(itemId, "itemId"),
      request.actor?.user.id ?? null,
    ));
  }

  @Delete("items/:itemId")
  async archiveItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.archiveItem(
      parseUuidParam(itemId, "itemId"),
      request.actor?.user.id ?? null,
    ));
  }

  @Post("items/:itemId/restore")
  async restoreItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.restoreItem(
      parseUuidParam(itemId, "itemId"),
      request.actor?.user.id ?? null,
    ));
  }

  @Get("bundles")
  async listBundles(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    this.requirePricebookViewer(request);

    try {
      return apiSuccess(await this.pricebookService.listBundles(parsePricebookBundleListQuery(query)));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundles_query_invalid");
    }
  }

  @Post("bundles")
  async createBundle(@Req() request: RequestWithActor, @Body() body: unknown) {
    this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.createBundle(
        parseCreatePricebookBundlePayload(body),
        request.actor?.user.id ?? null,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_invalid");
    }
  }

  @Get("bundles/:bundleId")
  async getBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    this.requirePricebookViewer(request);

    return apiSuccess(await this.pricebookService.getBundle(parseUuidParam(bundleId, "bundleId")));
  }

  @Patch("bundles/:bundleId")
  async updateBundle(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Body() body: unknown,
  ) {
    this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundle(
        parseUuidParam(bundleId, "bundleId"),
        parseUpdatePricebookBundlePayload(body),
        request.actor?.user.id ?? null,
      ));
    } catch (error) {
      this.handleValidationError(error, "pricebook_bundle_update_invalid");
    }
  }

  @Delete("bundles/:bundleId")
  async archiveBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.archiveBundle(
      parseUuidParam(bundleId, "bundleId"),
      request.actor?.user.id ?? null,
    ));
  }

  @Post("bundles/:bundleId/restore")
  async restoreBundle(@Req() request: RequestWithActor, @Param("bundleId") bundleId: string) {
    this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.restoreBundle(
      parseUuidParam(bundleId, "bundleId"),
      request.actor?.user.id ?? null,
    ));
  }

  @Post("bundles/:bundleId/items")
  async addItemToBundle(
    @Req() request: RequestWithActor,
    @Param("bundleId") bundleId: string,
    @Body() body: unknown,
  ) {
    this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.addItemToBundle(
        parseUuidParam(bundleId, "bundleId"),
        parseCreatePricebookBundleItemPayload(body),
        request.actor?.user.id ?? null,
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
    this.requirePricebookManager(request);

    try {
      return apiSuccess(await this.pricebookService.updateBundleItem(
        parseUuidParam(bundleId, "bundleId"),
        parseUuidParam(bundleItemId, "bundleItemId"),
        parseUpdatePricebookBundleItemPayload(body),
        request.actor?.user.id ?? null,
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
    this.requirePricebookManager(request);

    return apiSuccess(await this.pricebookService.removeBundleItem(
      parseUuidParam(bundleId, "bundleId"),
      parseUuidParam(bundleItemId, "bundleItemId"),
      request.actor?.user.id ?? null,
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
}