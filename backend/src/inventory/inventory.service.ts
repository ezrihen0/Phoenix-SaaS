import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { InventoryItemEntity } from "../database/entities/inventory-item.entity";
import { InventoryLocationEntity } from "../database/entities/inventory-location.entity";
import { InventoryMovementEntity } from "../database/entities/inventory-movement.entity";
import {
  inventoryTechnicianVisibleLocationTypes,
  isInventoryOfficeRole,
  type InventoryActiveState,
  type InventoryMovementType,
} from "./constants";
import type {
  AdjustInventoryPayload,
  CreateInventoryItemPayload,
  CreateInventoryLocationPayload,
  InventoryItemListQuery,
  InventoryLocationListQuery,
  InventoryMovementListQuery,
  InventoryStockListQuery,
  ReceiveInventoryPayload,
  TransferInventoryPayload,
  UpdateInventoryItemPayload,
  UpdateInventoryLocationPayload,
  UseInventoryPayload,
} from "./validation";

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItemEntity)
    private readonly inventoryItemsRepository: Repository<InventoryItemEntity>,
    @InjectRepository(InventoryLocationEntity)
    private readonly inventoryLocationsRepository: Repository<InventoryLocationEntity>,
    @InjectRepository(InventoryMovementEntity)
    private readonly inventoryMovementsRepository: Repository<InventoryMovementEntity>,
  ) {}

  async listItems(organizationId: string, query: InventoryItemListQuery) {
    const itemQuery = this.inventoryItemsRepository.createQueryBuilder("item");
    itemQuery.where("item.organization_id = :organizationId", { organizationId });

    this.applyItemActiveState(itemQuery, query.activeState);

    if (query.q) {
      itemQuery.andWhere(
        `(
          item.internal_sku LIKE :search
          OR item.name LIKE :search
          OR COALESCE(item.supplier_name, '') LIKE :search
          OR COALESCE(item.supplier_sku, '') LIKE :search
          OR COALESCE(item.notes, '') LIKE :search
        )`,
        { search: `%${query.q}%` },
      );
    }

    itemQuery.orderBy("item.name", "ASC");
    const items = await itemQuery.getMany();

    return {
      items: items.map((item) => this.toInventoryItemResponse(item)),
      totalCount: items.length,
    };
  }

  async createItem(organizationId: string, payload: CreateInventoryItemPayload, actorUserId: string | null) {
    await this.ensureItemSkuIsUnique(organizationId, payload.internalSku);

    const item = this.inventoryItemsRepository.create({
      organization_id: organizationId,
      internal_sku: payload.internalSku,
      name: payload.name,
      item_type: payload.itemType,
      unit_of_measure: payload.unitOfMeasure,
      default_cost_before_tax_cents: payload.defaultCostBeforeTaxCents,
      default_tax_cents: payload.defaultTaxCents,
      default_total_paid_cents: payload.defaultTotalPaidCents,
      supplier_name: payload.supplierName,
      supplier_sku: payload.supplierSku,
      reorder_point: payload.reorderPoint,
      notes: payload.notes,
      is_active: payload.isActive,
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
      archived_at: payload.isActive ? null : new Date(),
    });

    return this.toInventoryItemResponse(await this.inventoryItemsRepository.save(item));
  }

  async updateItem(
    organizationId: string,
    itemId: string,
    payload: UpdateInventoryItemPayload,
    actorUserId: string | null,
  ) {
    const item = await this.loadItemOrFail(organizationId, itemId);

    if (payload.internalSku !== undefined && payload.internalSku !== item.internal_sku) {
      await this.ensureItemSkuIsUnique(organizationId, payload.internalSku, item.id);
      item.internal_sku = payload.internalSku;
    }

    if (payload.name !== undefined) {
      item.name = payload.name;
    }

    if (payload.itemType !== undefined) {
      item.item_type = payload.itemType;
    }

    if (payload.unitOfMeasure !== undefined) {
      item.unit_of_measure = payload.unitOfMeasure;
    }

    if (payload.defaultCostBeforeTaxCents !== undefined) {
      item.default_cost_before_tax_cents = payload.defaultCostBeforeTaxCents;
    }

    if (payload.defaultTaxCents !== undefined) {
      item.default_tax_cents = payload.defaultTaxCents;
    }

    if (payload.defaultTotalPaidCents !== undefined) {
      item.default_total_paid_cents = payload.defaultTotalPaidCents;
    }

    if (payload.supplierName !== undefined) {
      item.supplier_name = payload.supplierName;
    }

    if (payload.supplierSku !== undefined) {
      item.supplier_sku = payload.supplierSku;
    }

    if (payload.reorderPoint !== undefined) {
      item.reorder_point = payload.reorderPoint;
    }

    if (payload.notes !== undefined) {
      item.notes = payload.notes;
    }

    if (payload.isActive !== undefined) {
      item.is_active = payload.isActive;
      item.archived_at = payload.isActive ? null : item.archived_at ?? new Date();
      item.deleted_by_user_id = payload.isActive ? null : actorUserId;
    }

    item.updated_by_user_id = actorUserId;
    return this.toInventoryItemResponse(await this.inventoryItemsRepository.save(item));
  }

  async archiveItem(organizationId: string, itemId: string, actorUserId: string | null) {
    const item = await this.loadItemOrFail(organizationId, itemId);
    item.is_active = false;
    item.archived_at = item.archived_at ?? new Date();
    item.deleted_by_user_id = actorUserId;
    item.updated_by_user_id = actorUserId;

    return this.toInventoryItemResponse(await this.inventoryItemsRepository.save(item));
  }

  async listLocations(
    organizationId: string,
    query: InventoryLocationListQuery,
    viewerRole: string | null,
    viewerUserId: string,
  ) {
    const locations = await this.loadVisibleLocations(organizationId, viewerRole, viewerUserId, query.activeState);

    return {
      locations: locations.map((location) => this.toInventoryLocationResponse(location)),
      totalCount: locations.length,
    };
  }

  async createLocation(organizationId: string, payload: CreateInventoryLocationPayload, actorUserId: string | null) {
    await this.ensureLocationNameIsUnique(organizationId, payload.name);

    const location = this.inventoryLocationsRepository.create({
      organization_id: organizationId,
      name: payload.name,
      location_type: payload.locationType,
      assigned_user_id: payload.assignedUserId,
      is_company_owned: payload.isCompanyOwned,
      vehicle_label: payload.vehicleLabel,
      license_plate: payload.licensePlate,
      notes: payload.notes,
      is_active: payload.isActive,
      created_by_user_id: actorUserId,
      updated_by_user_id: actorUserId,
      archived_at: payload.isActive ? null : new Date(),
    });

    return this.toInventoryLocationResponse(await this.inventoryLocationsRepository.save(location));
  }

  async updateLocation(
    organizationId: string,
    locationId: string,
    payload: UpdateInventoryLocationPayload,
    actorUserId: string | null,
  ) {
    const location = await this.loadLocationOrFail(organizationId, locationId);

    if (payload.name !== undefined && payload.name !== location.name) {
      await this.ensureLocationNameIsUnique(organizationId, payload.name, location.id);
      location.name = payload.name;
    }

    if (payload.locationType !== undefined) {
      location.location_type = payload.locationType;
    }

    if (payload.assignedUserId !== undefined) {
      location.assigned_user_id = payload.assignedUserId;
    }

    if (payload.isCompanyOwned !== undefined) {
      location.is_company_owned = payload.isCompanyOwned;
    }

    if (payload.vehicleLabel !== undefined) {
      location.vehicle_label = payload.vehicleLabel;
    }

    if (payload.licensePlate !== undefined) {
      location.license_plate = payload.licensePlate;
    }

    if (payload.notes !== undefined) {
      location.notes = payload.notes;
    }

    if (payload.isActive !== undefined) {
      location.is_active = payload.isActive;
      location.archived_at = payload.isActive ? null : location.archived_at ?? new Date();
      location.deleted_by_user_id = payload.isActive ? null : actorUserId;
    }

    location.updated_by_user_id = actorUserId;
    return this.toInventoryLocationResponse(await this.inventoryLocationsRepository.save(location));
  }

  async archiveLocation(organizationId: string, locationId: string, actorUserId: string | null) {
    const location = await this.loadLocationOrFail(organizationId, locationId);
    location.is_active = false;
    location.archived_at = location.archived_at ?? new Date();
    location.deleted_by_user_id = actorUserId;
    location.updated_by_user_id = actorUserId;

    return this.toInventoryLocationResponse(await this.inventoryLocationsRepository.save(location));
  }

  async listStock(
    organizationId: string,
    query: InventoryStockListQuery,
    viewerRole: string | null,
    viewerUserId: string,
  ) {
    const visibleLocations = await this.loadVisibleLocations(organizationId, viewerRole, viewerUserId, "active");
    const locationMap = new Map(visibleLocations.map((location) => [location.id, location]));
    const locationIds = visibleLocations.map((location) => location.id);

    if (query.locationId && !locationMap.has(query.locationId)) {
      return {
        rows: [],
        lowStockRows: [],
        totals: {
          itemCount: 0,
          locationCount: 0,
          lowStockCount: 0,
        },
      };
    }

    const itemQuery = this.inventoryItemsRepository.createQueryBuilder("item");
    itemQuery.where("item.organization_id = :organizationId", { organizationId });
    this.applyItemActiveState(itemQuery, query.activeState);

    if (query.q) {
      itemQuery.andWhere(
        `(
          item.internal_sku LIKE :search
          OR item.name LIKE :search
          OR COALESCE(item.supplier_name, '') LIKE :search
          OR COALESCE(item.supplier_sku, '') LIKE :search
        )`,
        { search: `%${query.q}%` },
      );
    }

    itemQuery.orderBy("item.name", "ASC");
    const items = await itemQuery.getMany();
    const balances = await this.getBalanceMap(
      organizationId,
      locationIds.length ? locationIds : null,
      items.map((item) => item.id),
    );
    const selectedLocations = query.locationId ? [locationMap.get(query.locationId)!] : visibleLocations;

    const rows = items
      .map((item) => {
        const locations = selectedLocations.map((location) => {
          const quantity = this.roundQuantity(balances.get(this.balanceKey(item.id, location.id)) ?? 0);

          return {
            location_id: location.id,
            location_name: location.name,
            location_type: location.location_type,
            assigned_user_id: location.assigned_user_id,
            quantity,
            quantity_display: this.formatQuantity(quantity),
          };
        });

        const totalQuantity = this.roundQuantity(locations.reduce((sum, location) => sum + location.quantity, 0));
        const reorderPoint = this.toNullableNumber(item.reorder_point);
        const lowStockLocations = reorderPoint === null
          ? []
          : locations.filter((location) => location.quantity <= reorderPoint).map((location) => ({
            location_id: location.location_id,
            location_name: location.location_name,
            quantity: location.quantity,
            quantity_display: location.quantity_display,
            reorder_point: reorderPoint,
            reorder_point_display: this.formatQuantity(reorderPoint),
          }));

        return {
          item_id: item.id,
          internal_sku: item.internal_sku,
          name: item.name,
          item_type: item.item_type,
          unit_of_measure: item.unit_of_measure,
          supplier_name: item.supplier_name,
          reorder_point: reorderPoint,
          reorder_point_display: reorderPoint === null ? null : this.formatQuantity(reorderPoint),
          is_active: item.is_active,
          total_quantity: totalQuantity,
          total_quantity_display: this.formatQuantity(totalQuantity),
          locations,
          low_stock_locations: lowStockLocations,
        };
      })
      .filter((row) => !query.lowStockOnly || row.low_stock_locations.length > 0);

    const lowStockRows = rows.flatMap((row) => row.low_stock_locations.map((location) => ({
      item_id: row.item_id,
      internal_sku: row.internal_sku,
      name: row.name,
      unit_of_measure: row.unit_of_measure,
      location_id: location.location_id,
      location_name: location.location_name,
      quantity: location.quantity,
      quantity_display: location.quantity_display,
      reorder_point: location.reorder_point,
      reorder_point_display: location.reorder_point_display,
    })));

    return {
      rows,
      lowStockRows,
      totals: {
        itemCount: rows.length,
        locationCount: selectedLocations.length,
        lowStockCount: lowStockRows.length,
      },
    };
  }

  async listMovements(
    organizationId: string,
    query: InventoryMovementListQuery,
    viewerRole: string | null,
    viewerUserId: string,
  ) {
    const visibleLocations = await this.loadVisibleLocations(organizationId, viewerRole, viewerUserId, "all");
    const locationIds = new Set(visibleLocations.map((location) => location.id));
    const locationMap = new Map(visibleLocations.map((location) => [location.id, location]));
    const items = await this.inventoryItemsRepository.find({
      where: {
        organization_id: organizationId,
        archived_at: IsNull(),
      },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    const movements = (await this.inventoryMovementsRepository.find({
      where: {
        organization_id: organizationId,
      },
      order: { created_at: "DESC" },
    }))
      .filter((movement) => {
        if (!isInventoryOfficeRole(viewerRole)) {
          const hasVisibleLocation = (
            (movement.from_location_id && locationIds.has(movement.from_location_id))
            || (movement.to_location_id && locationIds.has(movement.to_location_id))
          );

          if (!hasVisibleLocation) {
            return false;
          }
        }

        if (query.movementType && movement.movement_type !== query.movementType) {
          return false;
        }

        if (query.itemId && movement.inventory_item_id !== query.itemId) {
          return false;
        }

        if (query.locationId && movement.from_location_id !== query.locationId && movement.to_location_id !== query.locationId) {
          return false;
        }

        if (query.q) {
          const item = itemMap.get(movement.inventory_item_id);
          const fromLocation = movement.from_location_id ? locationMap.get(movement.from_location_id) : null;
          const toLocation = movement.to_location_id ? locationMap.get(movement.to_location_id) : null;
          const search = query.q.toLowerCase();
          const haystack = [
            item?.internal_sku,
            item?.name,
            movement.note,
            movement.supplier_name,
            movement.supplier_invoice_number,
            fromLocation?.name,
            toLocation?.name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(search);
        }

        return true;
      });

    const totalCount = movements.length;
    const pagedMovements = movements.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

    return {
      movements: pagedMovements.map((movement) => this.toMovementResponse(
        movement,
        itemMap.get(movement.inventory_item_id) ?? null,
        movement.from_location_id ? locationMap.get(movement.from_location_id) ?? null : null,
        movement.to_location_id ? locationMap.get(movement.to_location_id) ?? null : null,
      )),
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async receiveStock(organizationId: string, payload: ReceiveInventoryPayload, actorUserId: string | null) {
    const location = await this.loadActiveLocationOrFail(organizationId, payload.toLocationId, "receive destination");
    const itemMap = await this.loadActiveItemMap(organizationId, payload.lines.map((line) => line.inventoryItemId));

    const movements = payload.lines.map((line) => this.inventoryMovementsRepository.create({
      organization_id: organizationId,
      inventory_item_id: this.ensureItemVisible(itemMap, line.inventoryItemId).id,
      movement_type: "received",
      quantity: line.quantity,
      from_location_id: null,
      to_location_id: location.id,
      unit_cost_before_tax_cents: line.unitCostBeforeTaxCents ?? null,
      tax_paid_cents: line.taxPaidCents ?? null,
      total_paid_cents: line.totalPaidCents ?? null,
      supplier_name: payload.supplierName,
      supplier_invoice_number: payload.supplierInvoiceNumber,
      job_id: null,
      invoice_id: null,
      note: line.note ?? null,
      created_by_user_id: actorUserId,
      occurred_at: payload.occurredAt,
    }));

    const created = await this.inventoryMovementsRepository.save(movements);
    return {
      created: created.length,
      movements: created.map((movement) => this.toMovementResponse(movement, itemMap.get(movement.inventory_item_id) ?? null, null, location)),
    };
  }

  async transferStock(organizationId: string, payload: TransferInventoryPayload, actorUserId: string | null) {
    if (payload.fromLocationId === payload.toLocationId) {
      apiError(400, "inventory_transfer_same_location", "Transfer source and destination must be different.");
    }

    const fromLocation = await this.loadActiveLocationOrFail(organizationId, payload.fromLocationId, "transfer source");
    const toLocation = await this.loadActiveLocationOrFail(organizationId, payload.toLocationId, "transfer destination");
    const itemIds = payload.lines.map((line) => line.inventoryItemId);
    const itemMap = await this.loadActiveItemMap(organizationId, itemIds);
    await this.assertLocationHasStock(organizationId, fromLocation.id, payload.lines.map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
    })));

    const created = await this.inventoryMovementsRepository.save(payload.lines.map((line) => this.inventoryMovementsRepository.create({
      organization_id: organizationId,
      inventory_item_id: this.ensureItemVisible(itemMap, line.inventoryItemId).id,
      movement_type: "transfer",
      quantity: line.quantity,
      from_location_id: fromLocation.id,
      to_location_id: toLocation.id,
      unit_cost_before_tax_cents: null,
      tax_paid_cents: null,
      total_paid_cents: null,
      supplier_name: null,
      supplier_invoice_number: null,
      job_id: null,
      invoice_id: null,
      note: line.note ?? null,
      created_by_user_id: actorUserId,
      occurred_at: payload.occurredAt,
    })));

    return {
      created: created.length,
      movements: created.map((movement) => this.toMovementResponse(
        movement,
        itemMap.get(movement.inventory_item_id) ?? null,
        fromLocation,
        toLocation,
      )),
    };
  }

  async useStock(organizationId: string, payload: UseInventoryPayload, actorUserId: string | null) {
    const fromLocation = await this.loadActiveLocationOrFail(organizationId, payload.fromLocationId, "use source");
    const itemMap = await this.loadActiveItemMap(organizationId, payload.lines.map((line) => line.inventoryItemId));
    await this.assertLocationHasStock(organizationId, fromLocation.id, payload.lines.map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
    })));

    const created = await this.inventoryMovementsRepository.save(payload.lines.map((line) => this.inventoryMovementsRepository.create({
      organization_id: organizationId,
      inventory_item_id: this.ensureItemVisible(itemMap, line.inventoryItemId).id,
      movement_type: "used",
      quantity: line.quantity,
      from_location_id: fromLocation.id,
      to_location_id: null,
      unit_cost_before_tax_cents: null,
      tax_paid_cents: null,
      total_paid_cents: null,
      supplier_name: null,
      supplier_invoice_number: null,
      job_id: payload.jobId,
      invoice_id: null,
      note: line.note ?? null,
      created_by_user_id: actorUserId,
      occurred_at: payload.occurredAt,
    })));

    return {
      created: created.length,
      movements: created.map((movement) => this.toMovementResponse(movement, itemMap.get(movement.inventory_item_id) ?? null, fromLocation, null)),
    };
  }

  async adjustStock(organizationId: string, payload: AdjustInventoryPayload, actorUserId: string | null) {
    if (!payload.fromLocationId && !payload.toLocationId) {
      apiError(400, "inventory_adjust_location_required", "Adjustments require a source or destination location.");
    }

    if (payload.movementType === "damaged" && !payload.fromLocationId) {
      apiError(400, "inventory_adjust_damaged_source_required", "Damaged inventory requires a source location.");
    }

    if (payload.movementType === "returned" && !payload.toLocationId) {
      apiError(400, "inventory_adjust_return_destination_required", "Returned inventory requires a destination location.");
    }

    const fromLocation = payload.fromLocationId ? await this.loadActiveLocationOrFail(organizationId, payload.fromLocationId, "adjust source") : null;
    const toLocation = payload.toLocationId ? await this.loadActiveLocationOrFail(organizationId, payload.toLocationId, "adjust destination") : null;
    const itemMap = await this.loadActiveItemMap(organizationId, payload.lines.map((line) => line.inventoryItemId));

    if (fromLocation && payload.movementType !== "returned") {
      await this.assertLocationHasStock(organizationId, fromLocation.id, payload.lines.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
      })));
    }

    const created = await this.inventoryMovementsRepository.save(payload.lines.map((line) => this.inventoryMovementsRepository.create({
      organization_id: organizationId,
      inventory_item_id: this.ensureItemVisible(itemMap, line.inventoryItemId).id,
      movement_type: payload.movementType,
      quantity: line.quantity,
      from_location_id: fromLocation?.id ?? null,
      to_location_id: toLocation?.id ?? null,
      unit_cost_before_tax_cents: null,
      tax_paid_cents: null,
      total_paid_cents: null,
      supplier_name: null,
      supplier_invoice_number: null,
      job_id: null,
      invoice_id: null,
      note: line.note ?? null,
      created_by_user_id: actorUserId,
      occurred_at: payload.occurredAt,
    })));

    return {
      created: created.length,
      movements: created.map((movement) => this.toMovementResponse(
        movement,
        itemMap.get(movement.inventory_item_id) ?? null,
        fromLocation,
        toLocation,
      )),
    };
  }

  private applyItemActiveState(itemQuery: ReturnType<Repository<InventoryItemEntity>["createQueryBuilder"]>, activeState: InventoryActiveState) {
    if (activeState === "active") {
      itemQuery.andWhere("item.is_active = :isActive", { isActive: true });
      itemQuery.andWhere("item.archived_at IS NULL");
    } else if (activeState === "archived") {
      itemQuery.andWhere("item.is_active = :isActive", { isActive: false });
      itemQuery.andWhere("item.archived_at IS NOT NULL");
    }
  }

  private async ensureItemSkuIsUnique(organizationId: string, internalSku: string, excludeItemId?: string) {
    const existingItem = await this.inventoryItemsRepository.findOne({
      where: { internal_sku: internalSku, organization_id: organizationId },
    });

    if (existingItem && existingItem.id !== excludeItemId) {
      apiError(409, "inventory_item_sku_exists", "An inventory item with this SKU already exists.");
    }
  }

  private async ensureLocationNameIsUnique(organizationId: string, name: string, excludeLocationId?: string) {
    const existingLocation = await this.inventoryLocationsRepository.findOne({
      where: { name, organization_id: organizationId },
    });

    if (existingLocation && existingLocation.id !== excludeLocationId) {
      apiError(409, "inventory_location_name_exists", "An inventory location with this name already exists.");
    }
  }

  private async loadItemOrFail(organizationId: string, itemId: string) {
    const item = await this.inventoryItemsRepository.findOne({ where: { id: itemId, organization_id: organizationId } });

    if (!item) {
      apiError(404, "inventory_item_not_found", "The inventory item could not be found.");
    }

    return item;
  }

  private async loadLocationOrFail(organizationId: string, locationId: string) {
    const location = await this.inventoryLocationsRepository.findOne({ where: { id: locationId, organization_id: organizationId } });

    if (!location) {
      apiError(404, "inventory_location_not_found", "The inventory location could not be found.");
    }

    return location;
  }

  private async loadActiveLocationOrFail(organizationId: string, locationId: string, label: string) {
    const location = await this.loadLocationOrFail(organizationId, locationId);

    if (!location.is_active || location.archived_at) {
      apiError(400, "inventory_location_inactive", `The ${label} location is archived and cannot be used.`);
    }

    return location;
  }

  private async loadActiveItemMap(organizationId: string, itemIds: string[]) {
    const uniqueItemIds = [...new Set(itemIds)];
    const items = await this.inventoryItemsRepository.findBy(
      uniqueItemIds.map((id) => ({ id, organization_id: organizationId })),
    );
    const itemMap = new Map(items.map((item) => [item.id, item]));

    uniqueItemIds.forEach((itemId) => {
      const item = itemMap.get(itemId);

      if (!item) {
        apiError(404, "inventory_item_not_found", "One or more inventory items could not be found.");
      }

      if (!item.is_active || item.archived_at) {
        apiError(400, "inventory_item_inactive", `Inventory item ${item.name} is archived and cannot be used.`);
      }
    });

    return itemMap;
  }

  private ensureItemVisible(itemMap: Map<string, InventoryItemEntity>, itemId: string) {
    const item = itemMap.get(itemId);

    if (!item) {
      apiError(404, "inventory_item_not_found", "The inventory item could not be found.");
    }

    return item;
  }

  private async loadVisibleLocations(
    organizationId: string,
    viewerRole: string | null,
    viewerUserId: string,
    activeState: InventoryActiveState,
  ) {
    const locationQuery = this.inventoryLocationsRepository.createQueryBuilder("location");
    locationQuery.where("location.organization_id = :organizationId", { organizationId });

    if (activeState === "active") {
      locationQuery.andWhere("location.is_active = :isActive", { isActive: true });
      locationQuery.andWhere("location.archived_at IS NULL");
    } else if (activeState === "archived") {
      locationQuery.andWhere("location.is_active = :isActive", { isActive: false });
      locationQuery.andWhere("location.archived_at IS NOT NULL");
    }

    if (!isInventoryOfficeRole(viewerRole)) {
      locationQuery.andWhere("location.assigned_user_id = :assignedUserId", { assignedUserId: viewerUserId });
      locationQuery.andWhere("location.location_type IN (:...locationTypes)", {
        locationTypes: [...inventoryTechnicianVisibleLocationTypes],
      });
    }

    locationQuery.orderBy("location.name", "ASC");
    return locationQuery.getMany();
  }

  private async getBalanceMap(organizationId: string, locationIds: string[] | null, itemIds: string[] | null) {
    const balanceMap = new Map<string, number>();
    const movements = await this.inventoryMovementsRepository.find({
      where: {
        organization_id: organizationId,
      },
    });
    const locationFilter = locationIds ? new Set(locationIds) : null;
    const itemFilter = itemIds ? new Set(itemIds) : null;

    movements.forEach((movement) => {
      if (itemFilter && !itemFilter.has(movement.inventory_item_id)) {
        return;
      }

      const quantity = this.toNumber(movement.quantity);

      if (movement.from_location_id && (!locationFilter || locationFilter.has(movement.from_location_id))) {
        const key = this.balanceKey(movement.inventory_item_id, movement.from_location_id);
        balanceMap.set(key, this.roundQuantity((balanceMap.get(key) ?? 0) - quantity));
      }

      if (movement.to_location_id && (!locationFilter || locationFilter.has(movement.to_location_id))) {
        const key = this.balanceKey(movement.inventory_item_id, movement.to_location_id);
        balanceMap.set(key, this.roundQuantity((balanceMap.get(key) ?? 0) + quantity));
      }
    });

    return balanceMap;
  }

  private async assertLocationHasStock(
    organizationId: string,
    locationId: string,
    lines: Array<{ inventoryItemId: string; quantity: string }>,
  ) {
    const balanceMap = await this.getBalanceMap(organizationId, [locationId], lines.map((line) => line.inventoryItemId));
    const pendingUsage = new Map<string, number>();

    lines.forEach((line) => {
      const requested = this.toNumber(line.quantity);
      const key = this.balanceKey(line.inventoryItemId, locationId);
      const available = balanceMap.get(key) ?? 0;
      const alreadyReserved = pendingUsage.get(key) ?? 0;

      if (requested + alreadyReserved > available + 0.0001) {
        apiError(400, "inventory_insufficient_stock", "One or more inventory lines exceed stock on hand at the source location.");
      }

      pendingUsage.set(key, this.roundQuantity(alreadyReserved + requested));
    });
  }

  private balanceKey(itemId: string, locationId: string) {
    return `${itemId}:${locationId}`;
  }

  private toNumber(value: string | number | null | undefined) {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private toNullableNumber(value: string | null | undefined) {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private roundQuantity(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  private formatQuantity(value: number) {
    return this.roundQuantity(value).toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  private toInventoryItemResponse(item: InventoryItemEntity) {
    return {
      ...item,
      reorder_point: item.reorder_point,
    };
  }

  private toInventoryLocationResponse(location: InventoryLocationEntity) {
    return { ...location };
  }

  private toMovementResponse(
    movement: InventoryMovementEntity,
    item: InventoryItemEntity | null,
    fromLocation: InventoryLocationEntity | null,
    toLocation: InventoryLocationEntity | null,
  ) {
    return {
      ...movement,
      quantity_number: this.toNumber(movement.quantity),
      quantity_display: this.formatQuantity(this.toNumber(movement.quantity)),
      item_name: item?.name ?? null,
      item_sku: item?.internal_sku ?? null,
      item_type: item?.item_type ?? null,
      unit_of_measure: item?.unit_of_measure ?? null,
      from_location_name: fromLocation?.name ?? null,
      to_location_name: toLocation?.name ?? null,
    };
  }
}