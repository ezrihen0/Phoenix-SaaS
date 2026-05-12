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
import { apiError, apiSuccess } from "../common/api-response";
import type { RequestWithActor } from "../common/request-types";
import { canManageInventory, isInventoryOfficeRole } from "./constants";
import { InventoryService } from "./inventory.service";
import {
  parseAdjustInventoryPayload,
  parseCreateInventoryItemPayload,
  parseCreateInventoryLocationPayload,
  parseInventoryItemListQuery,
  parseInventoryLocationListQuery,
  parseInventoryMovementListQuery,
  parseInventoryStockListQuery,
  parseReceiveInventoryPayload,
  parseTransferInventoryPayload,
  parseUpdateInventoryItemPayload,
  parseUpdateInventoryLocationPayload,
  parseUseInventoryPayload,
  parseUuidParam,
} from "./validation";

@UseGuards(SessionGuard)
@Controller("api/inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("items")
  async listItems(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.listItems(
        this.requireOrganizationId(actor),
        parseInventoryItemListQuery(query),
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_items_query_invalid");
    }
  }

  @Post("items")
  async createItem(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.createItem(
        this.requireOrganizationId(actor),
        parseCreateInventoryItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_item_invalid");
    }
  }

  @Patch("items/:itemId")
  async updateItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.updateItem(
        this.requireOrganizationId(actor),
        parseUuidParam(itemId, "itemId"),
        parseUpdateInventoryItemPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_item_update_invalid");
    }
  }

  @Delete("items/:itemId")
  async archiveItem(@Req() request: RequestWithActor, @Param("itemId") itemId: string) {
    const actor = this.requireOfficeInventoryActor(request);

    return apiSuccess(await this.inventoryService.archiveItem(
      this.requireOrganizationId(actor),
      parseUuidParam(itemId, "itemId"),
      actor.user.id,
    ));
  }

  @Get("locations")
  async listLocations(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requireInventoryViewer(request);

    try {
      return apiSuccess(await this.inventoryService.listLocations(
        this.requireOrganizationId(actor),
        parseInventoryLocationListQuery(query),
        actor.role ?? actor.profile?.role ?? null,
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_locations_query_invalid");
    }
  }

  @Post("locations")
  async createLocation(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.createLocation(
        this.requireOrganizationId(actor),
        parseCreateInventoryLocationPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_location_invalid");
    }
  }

  @Patch("locations/:locationId")
  async updateLocation(@Req() request: RequestWithActor, @Param("locationId") locationId: string, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.updateLocation(
        this.requireOrganizationId(actor),
        parseUuidParam(locationId, "locationId"),
        parseUpdateInventoryLocationPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_location_update_invalid");
    }
  }

  @Delete("locations/:locationId")
  async archiveLocation(@Req() request: RequestWithActor, @Param("locationId") locationId: string) {
    const actor = this.requireOfficeInventoryActor(request);

    return apiSuccess(await this.inventoryService.archiveLocation(
      this.requireOrganizationId(actor),
      parseUuidParam(locationId, "locationId"),
      actor.user.id,
    ));
  }

  @Get("stock")
  async listStock(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requireInventoryViewer(request);

    try {
      return apiSuccess(await this.inventoryService.listStock(
        this.requireOrganizationId(actor),
        parseInventoryStockListQuery(query),
        actor.role ?? actor.profile?.role ?? null,
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_stock_query_invalid");
    }
  }

  @Get("movements")
  async listMovements(@Req() request: RequestWithActor, @Query() query: Record<string, unknown>) {
    const actor = this.requireInventoryViewer(request);

    try {
      return apiSuccess(await this.inventoryService.listMovements(
        this.requireOrganizationId(actor),
        parseInventoryMovementListQuery(query),
        actor.role ?? actor.profile?.role ?? null,
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_movements_query_invalid");
    }
  }

  @Post("receive")
  async receiveStock(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.receiveStock(
        this.requireOrganizationId(actor),
        parseReceiveInventoryPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_receive_invalid");
    }
  }

  @Post("transfer")
  async transferStock(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.transferStock(
        this.requireOrganizationId(actor),
        parseTransferInventoryPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_transfer_invalid");
    }
  }

  @Post("use")
  async useStock(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.useStock(
        this.requireOrganizationId(actor),
        parseUseInventoryPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_use_invalid");
    }
  }

  @Post("adjust")
  async adjustStock(@Req() request: RequestWithActor, @Body() body: unknown) {
    const actor = this.requireOfficeInventoryActor(request);

    try {
      return apiSuccess(await this.inventoryService.adjustStock(
        this.requireOrganizationId(actor),
        parseAdjustInventoryPayload(body),
        actor.user.id,
      ));
    } catch (error) {
      this.handleValidationError(error, "inventory_adjust_invalid");
    }
  }

  private requireInventoryViewer(request: RequestWithActor) {
    const actor = request.actor;
    const role = typeof actor?.role === "string"
      ? actor.role.trim().toLowerCase()
      : typeof actor?.profile?.role === "string"
        ? actor.profile.role.trim().toLowerCase()
        : "";

    if (!actor?.user || (!isInventoryOfficeRole(role) && role !== "technician")) {
      apiError(403, "inventory_forbidden", "This inventory view is not available for the current account.");
    }

    return actor;
  }

  private requireOfficeInventoryActor(request: RequestWithActor) {
    const actor = request.actor;
    const role = typeof actor?.role === "string"
      ? actor.role.trim().toLowerCase()
      : typeof actor?.profile?.role === "string"
        ? actor.profile.role.trim().toLowerCase()
        : "";

    if (!actor?.user || !canManageInventory(role)) {
      apiError(403, "inventory_office_required", "Only office inventory roles can change inventory records.");
    }

    return actor;
  }

  private requireOrganizationId(actor: RequestWithActor["actor"]) {
    const organizationId = actor?.organization_id;

    if (!organizationId) {
      apiError(400, "organization_context_missing", "An active organization is required for inventory.");
    }

    return organizationId;
  }

  private handleValidationError(error: unknown, code: string): never {
    if (error instanceof Error) {
      apiError(400, code, error.message);
    }

    throw error;
  }
}