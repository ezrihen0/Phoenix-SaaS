import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import type {
  CreatePricebookBundleItemPayload,
  CreatePricebookBundlePayload,
  CreatePricebookItemPayload,
  PricebookBundleListQuery,
  PricebookItemListQuery,
  UpdatePricebookBundleItemPayload,
  UpdatePricebookBundlePayload,
  UpdatePricebookItemPayload,
} from "./validation";

@Injectable()
export class PricebookService {
  constructor(
    @InjectRepository(PricebookItemEntity)
    private readonly pricebookItemRepository: Repository<PricebookItemEntity>,
    @InjectRepository(PricebookBundleEntity)
    private readonly pricebookBundleRepository: Repository<PricebookBundleEntity>,
    @InjectRepository(PricebookBundleItemEntity)
    private readonly pricebookBundleItemRepository: Repository<PricebookBundleItemEntity>,
  ) {}

  async listItems(query: PricebookItemListQuery) {
    const itemQuery = this.pricebookItemRepository.createQueryBuilder("item");

    if (query.activeState === "active") {
      itemQuery.andWhere("item.is_active = :isActive", { isActive: true });
      itemQuery.andWhere("item.archived_at IS NULL");
    } else if (query.activeState === "archived") {
      itemQuery.andWhere("item.is_active = :isActive", { isActive: false });
      itemQuery.andWhere("item.archived_at IS NOT NULL");
    }

    if (query.itemType) {
      itemQuery.andWhere("item.item_type = :itemType", { itemType: query.itemType });
    }

    if (query.tradeArea) {
      itemQuery.andWhere("item.trade_area = :tradeArea", { tradeArea: query.tradeArea });
    }

    if (query.popularOnly) {
      itemQuery.andWhere("item.is_popular = :isPopular", { isPopular: true });
    }

    if (query.q) {
      itemQuery.andWhere(
        `(
          item.internal_sku LIKE :search
          OR item.name LIKE :search
          OR COALESCE(item.customer_description, '') LIKE :search
          OR COALESCE(item.internal_description, '') LIKE :search
          OR CAST(item.tags AS CHAR) LIKE :search
        )`,
        { search: `%${query.q}%` },
      );
    }

    itemQuery
      .orderBy("item.is_popular", "DESC")
      .addOrderBy("item.sort_order", "ASC")
      .addOrderBy("item.name", "ASC")
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [items, totalCount] = await itemQuery.getManyAndCount();

    return {
      items: items.map((item) => this.toPricebookItemResponse(item)),
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createItem(payload: CreatePricebookItemPayload, actorUserId: string | null) {
    await this.ensureSkuIsUnique(payload.internalSku);

    const item = this.pricebookItemRepository.create({
      internal_sku: payload.internalSku,
      name: payload.name,
      customer_description: payload.customerDescription,
      internal_description: payload.internalDescription,
      item_type: payload.itemType,
      trade_area: payload.tradeArea,
      service_area: payload.serviceArea,
      tags: payload.tags,
      unit_of_measure: payload.unitOfMeasure,
      base_cost_cents: payload.baseCostCents,
      material_cost_cents: payload.materialCostCents,
      labor_cost_cents: payload.laborCostCents,
      customer_price_cents: payload.customerPriceCents,
      minimum_price_cents: payload.minimumPriceCents,
      estimated_labor_minutes: payload.estimatedLaborMinutes,
      warranty_months: payload.warrantyMonths,
      requires_permit: payload.requiresPermit,
      inventory_tracking_mode: payload.inventoryTrackingMode,
      supplier_name: payload.supplierName,
      supplier_sku: payload.supplierSku,
      inventory_notes: payload.inventoryNotes,
      is_popular: payload.isPopular,
      is_active: payload.isActive,
      sort_order: payload.sortOrder,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: payload.isActive ? null : new Date(),
    });

    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(item));
  }

  async getItem(itemId: string) {
    return this.toPricebookItemResponse(await this.loadItemOrFail(itemId));
  }

  async updateItem(itemId: string, payload: UpdatePricebookItemPayload, actorUserId: string | null) {
    const item = await this.loadItemOrFail(itemId);

    if (payload.internalSku && payload.internalSku !== item.internal_sku) {
      await this.ensureSkuIsUnique(payload.internalSku, item.id);
      item.internal_sku = payload.internalSku;
    }

    if (payload.name !== undefined) {
      item.name = payload.name;
    }

    if (payload.customerDescription !== undefined) {
      item.customer_description = payload.customerDescription;
    }

    if (payload.internalDescription !== undefined) {
      item.internal_description = payload.internalDescription;
    }

    if (payload.itemType !== undefined) {
      item.item_type = payload.itemType;
    }

    if (payload.tradeArea !== undefined) {
      item.trade_area = payload.tradeArea;
    }

    if (payload.serviceArea !== undefined) {
      item.service_area = payload.serviceArea;
    }

    if (payload.tags !== undefined) {
      item.tags = payload.tags;
    }

    if (payload.unitOfMeasure !== undefined) {
      item.unit_of_measure = payload.unitOfMeasure;
    }

    if (payload.baseCostCents !== undefined) {
      item.base_cost_cents = payload.baseCostCents;
    }

    if (payload.materialCostCents !== undefined) {
      item.material_cost_cents = payload.materialCostCents;
    }

    if (payload.laborCostCents !== undefined) {
      item.labor_cost_cents = payload.laborCostCents;
    }

    if (payload.customerPriceCents !== undefined) {
      item.customer_price_cents = payload.customerPriceCents;
    }

    if (payload.minimumPriceCents !== undefined) {
      item.minimum_price_cents = payload.minimumPriceCents;
    }

    if (payload.estimatedLaborMinutes !== undefined) {
      item.estimated_labor_minutes = payload.estimatedLaborMinutes;
    }

    if (payload.warrantyMonths !== undefined) {
      item.warranty_months = payload.warrantyMonths;
    }

    if (payload.requiresPermit !== undefined) {
      item.requires_permit = payload.requiresPermit;
    }

    if (payload.inventoryTrackingMode !== undefined) {
      item.inventory_tracking_mode = payload.inventoryTrackingMode;
    }

    if (payload.supplierName !== undefined) {
      item.supplier_name = payload.supplierName;
    }

    if (payload.supplierSku !== undefined) {
      item.supplier_sku = payload.supplierSku;
    }

    if (payload.inventoryNotes !== undefined) {
      item.inventory_notes = payload.inventoryNotes;
    }

    if (payload.isPopular !== undefined) {
      item.is_popular = payload.isPopular;
    }

    if (payload.isActive !== undefined) {
      item.is_active = payload.isActive;
      item.archived_at = payload.isActive ? null : item.archived_at ?? new Date();
      if (payload.isActive) {
        item.deleted_by_user_id = null;
      }
    }

    if (payload.sortOrder !== undefined) {
      item.sort_order = payload.sortOrder;
    }

    item.updated_by_user_id = actorUserId;
    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(item));
  }

  async duplicateItem(itemId: string, actorUserId: string | null) {
    const sourceItem = await this.loadItemOrFail(itemId);
    const duplicatedSku = await this.generateDuplicateSku(sourceItem.internal_sku);

    const duplicatedItem = this.pricebookItemRepository.create({
      internal_sku: duplicatedSku,
      name: `${sourceItem.name} Copy`,
      customer_description: sourceItem.customer_description,
      internal_description: sourceItem.internal_description,
      item_type: sourceItem.item_type,
      trade_area: sourceItem.trade_area,
      service_area: sourceItem.service_area,
      tags: Array.isArray(sourceItem.tags) ? [...sourceItem.tags] : [],
      unit_of_measure: sourceItem.unit_of_measure,
      base_cost_cents: sourceItem.base_cost_cents,
      material_cost_cents: sourceItem.material_cost_cents,
      labor_cost_cents: sourceItem.labor_cost_cents,
      customer_price_cents: sourceItem.customer_price_cents,
      minimum_price_cents: sourceItem.minimum_price_cents,
      estimated_labor_minutes: sourceItem.estimated_labor_minutes,
      warranty_months: sourceItem.warranty_months,
      requires_permit: sourceItem.requires_permit,
      inventory_tracking_mode: sourceItem.inventory_tracking_mode,
      supplier_name: sourceItem.supplier_name,
      supplier_sku: sourceItem.supplier_sku,
      inventory_notes: sourceItem.inventory_notes,
      is_popular: sourceItem.is_popular,
      is_active: true,
      sort_order: sourceItem.sort_order,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: null,
    });

    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(duplicatedItem));
  }

  async archiveItem(itemId: string, actorUserId: string | null) {
    const item = await this.loadItemOrFail(itemId);
    item.is_active = false;
    item.archived_at = item.archived_at ?? new Date();
    item.deleted_by_user_id = actorUserId;
    item.updated_by_user_id = actorUserId;

    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(item));
  }

  async restoreItem(itemId: string, actorUserId: string | null) {
    const item = await this.loadItemOrFail(itemId);
    item.is_active = true;
    item.archived_at = null;
    item.deleted_by_user_id = null;
    item.updated_by_user_id = actorUserId;

    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(item));
  }

  async listBundles(query: PricebookBundleListQuery) {
    const bundleQuery = this.pricebookBundleRepository.createQueryBuilder("bundle");

    if (query.activeState === "active") {
      bundleQuery.andWhere("bundle.is_active = :isActive", { isActive: true });
      bundleQuery.andWhere("bundle.archived_at IS NULL");
    } else if (query.activeState === "archived") {
      bundleQuery.andWhere("bundle.is_active = :isActive", { isActive: false });
      bundleQuery.andWhere("bundle.archived_at IS NOT NULL");
    }

    if (query.q) {
      bundleQuery.andWhere(
        `(
          bundle.name LIKE :search
          OR COALESCE(bundle.description, '') LIKE :search
        )`,
        { search: `%${query.q}%` },
      );
    }

    bundleQuery
      .orderBy("bundle.name", "ASC")
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [bundles, totalCount] = await bundleQuery.getManyAndCount();

    return {
      items: bundles.map((bundle) => this.toPricebookBundleResponse(bundle)),
      totalCount,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createBundle(payload: CreatePricebookBundlePayload, actorUserId: string | null) {
    const bundle = this.pricebookBundleRepository.create({
      name: payload.name,
      description: payload.description,
      is_active: payload.isActive,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: payload.isActive ? null : new Date(),
    });

    return this.toPricebookBundleResponse(await this.pricebookBundleRepository.save(bundle));
  }

  async getBundle(bundleId: string) {
    const bundle = await this.loadBundleWithItemsOrFail(bundleId);
    return this.toPricebookBundleDetailResponse(bundle);
  }

  async updateBundle(bundleId: string, payload: UpdatePricebookBundlePayload, actorUserId: string | null) {
    const bundle = await this.loadBundleOrFail(bundleId);

    if (payload.name !== undefined) {
      bundle.name = payload.name;
    }

    if (payload.description !== undefined) {
      bundle.description = payload.description;
    }

    if (payload.isActive !== undefined) {
      bundle.is_active = payload.isActive;
      bundle.archived_at = payload.isActive ? null : bundle.archived_at ?? new Date();
      if (payload.isActive) {
        bundle.deleted_by_user_id = null;
      }
    }

    bundle.updated_by_user_id = actorUserId;
    return this.toPricebookBundleResponse(await this.pricebookBundleRepository.save(bundle));
  }

  async archiveBundle(bundleId: string, actorUserId: string | null) {
    const bundle = await this.loadBundleOrFail(bundleId);
    bundle.is_active = false;
    bundle.archived_at = bundle.archived_at ?? new Date();
    bundle.deleted_by_user_id = actorUserId;
    bundle.updated_by_user_id = actorUserId;

    return this.toPricebookBundleResponse(await this.pricebookBundleRepository.save(bundle));
  }

  async restoreBundle(bundleId: string, actorUserId: string | null) {
    const bundle = await this.loadBundleOrFail(bundleId);
    bundle.is_active = true;
    bundle.archived_at = null;
    bundle.deleted_by_user_id = null;
    bundle.updated_by_user_id = actorUserId;

    return this.toPricebookBundleResponse(await this.pricebookBundleRepository.save(bundle));
  }

  async addItemToBundle(
    bundleId: string,
    payload: CreatePricebookBundleItemPayload,
    actorUserId: string | null,
  ) {
    const bundle = await this.loadBundleOrFail(bundleId);

    if (!bundle.is_active || bundle.archived_at) {
      apiError(409, "pricebook_bundle_archived", "Archived bundles cannot be modified.");
    }

    const pricebookItem = await this.loadItemOrFail(payload.pricebookItemId);

    if (!pricebookItem.is_active || pricebookItem.archived_at) {
      apiError(409, "pricebook_item_archived", "Archived pricebook items cannot be added to a bundle.");
    }

    const existingMembership = await this.pricebookBundleItemRepository.findOne({
      where: {
        bundle_id: bundleId,
        pricebook_item_id: payload.pricebookItemId,
        archived_at: IsNull(),
      },
    });

    if (existingMembership) {
      apiError(409, "pricebook_bundle_item_duplicate", "This pricebook item is already in the bundle.");
    }

    const bundleItem = this.pricebookBundleItemRepository.create({
      bundle_id: bundleId,
      pricebook_item_id: payload.pricebookItemId,
      default_quantity: payload.defaultQuantity,
      sort_order: payload.sortOrder,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: null,
    });

    return this.toPricebookBundleItemResponse(await this.pricebookBundleItemRepository.save(bundleItem), pricebookItem);
  }

  async updateBundleItem(
    bundleId: string,
    bundleItemId: string,
    payload: UpdatePricebookBundleItemPayload,
    actorUserId: string | null,
  ) {
    const bundleItem = await this.loadBundleItemOrFail(bundleId, bundleItemId);

    if (payload.defaultQuantity !== undefined) {
      bundleItem.default_quantity = payload.defaultQuantity;
    }

    if (payload.sortOrder !== undefined) {
      bundleItem.sort_order = payload.sortOrder;
    }

    bundleItem.updated_by_user_id = actorUserId;

    const saved = await this.pricebookBundleItemRepository.save(bundleItem);
    const pricebookItem = saved.pricebook_item ?? await this.loadItemOrFail(saved.pricebook_item_id);
    return this.toPricebookBundleItemResponse(saved, pricebookItem);
  }

  async removeBundleItem(bundleId: string, bundleItemId: string, actorUserId: string | null) {
    const bundleItem = await this.loadBundleItemOrFail(bundleId, bundleItemId);
    bundleItem.archived_at = bundleItem.archived_at ?? new Date();
    bundleItem.deleted_by_user_id = actorUserId;
    bundleItem.updated_by_user_id = actorUserId;

    const saved = await this.pricebookBundleItemRepository.save(bundleItem);
    const pricebookItem = saved.pricebook_item ?? await this.loadItemOrFail(saved.pricebook_item_id);
    return this.toPricebookBundleItemResponse(saved, pricebookItem);
  }

  private async loadItemOrFail(itemId: string) {
    const item = await this.pricebookItemRepository.findOne({ where: { id: itemId } });

    if (!item) {
      apiError(404, "pricebook_item_not_found", "The requested pricebook item could not be found.");
    }

    return item;
  }

  private async loadBundleOrFail(bundleId: string) {
    const bundle = await this.pricebookBundleRepository.findOne({ where: { id: bundleId } });

    if (!bundle) {
      apiError(404, "pricebook_bundle_not_found", "The requested pricebook bundle could not be found.");
    }

    return bundle;
  }

  private async loadBundleWithItemsOrFail(bundleId: string) {
    const bundle = await this.pricebookBundleRepository.findOne({
      where: { id: bundleId },
      relations: {
        items: {
          pricebook_item: true,
        },
      },
    });

    if (!bundle) {
      apiError(404, "pricebook_bundle_not_found", "The requested pricebook bundle could not be found.");
    }

    return bundle;
  }

  private async loadBundleItemOrFail(bundleId: string, bundleItemId: string) {
    const bundleItem = await this.pricebookBundleItemRepository.findOne({
      where: {
        id: bundleItemId,
        bundle_id: bundleId,
      },
      relations: {
        pricebook_item: true,
      },
    });

    if (!bundleItem || bundleItem.archived_at) {
      apiError(404, "pricebook_bundle_item_not_found", "The requested bundle item could not be found.");
    }

    return bundleItem;
  }

  private async ensureSkuIsUnique(internalSku: string, excludeItemId?: string) {
    const existingItem = await this.pricebookItemRepository.findOne({
      where: { internal_sku: internalSku },
      select: { id: true, internal_sku: true },
    });

    if (existingItem && existingItem.id !== excludeItemId) {
      apiError(409, "pricebook_item_sku_conflict", "A pricebook item with that SKU already exists.");
    }
  }

  private async generateDuplicateSku(sourceSku: string) {
    const baseSku = sourceSku.trim();

    for (let copyIndex = 1; copyIndex <= 1000; copyIndex += 1) {
      const suffix = `-COPY-${copyIndex}`;
      const truncatedBase = baseSku.slice(0, Math.max(1, 128 - suffix.length));
      const candidateSku = `${truncatedBase}${suffix}`;
      const existingCandidate = await this.pricebookItemRepository.findOne({
        where: { internal_sku: candidateSku },
        select: { id: true },
      });

      if (!existingCandidate) {
        return candidateSku;
      }
    }

    apiError(409, "pricebook_item_duplicate_sku_exhausted", "Unable to generate a unique duplicate SKU.");
  }

  private toPricebookItemResponse(item: PricebookItemEntity) {
    return {
      id: item.id,
      internal_sku: item.internal_sku,
      name: item.name,
      customer_description: item.customer_description,
      internal_description: item.internal_description,
      item_type: item.item_type,
      trade_area: item.trade_area,
      service_area: item.service_area,
      tags: Array.isArray(item.tags) ? item.tags : [],
      unit_of_measure: item.unit_of_measure,
      base_cost_cents: item.base_cost_cents,
      material_cost_cents: item.material_cost_cents,
      labor_cost_cents: item.labor_cost_cents,
      customer_price_cents: item.customer_price_cents,
      minimum_price_cents: item.minimum_price_cents,
      estimated_labor_minutes: item.estimated_labor_minutes,
      warranty_months: item.warranty_months,
      requires_permit: item.requires_permit,
      inventory_tracking_mode: item.inventory_tracking_mode,
      supplier_name: item.supplier_name,
      supplier_sku: item.supplier_sku,
      inventory_notes: item.inventory_notes,
      is_popular: item.is_popular,
      is_active: item.is_active,
      sort_order: item.sort_order,
      created_by_user_id: item.created_by_user_id,
      updated_by_user_id: item.updated_by_user_id,
      deleted_by_user_id: item.deleted_by_user_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      archived_at: item.archived_at,
    };
  }

  private toPricebookBundleResponse(bundle: PricebookBundleEntity) {
    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description,
      is_active: bundle.is_active,
      created_by_user_id: bundle.created_by_user_id,
      updated_by_user_id: bundle.updated_by_user_id,
      deleted_by_user_id: bundle.deleted_by_user_id,
      created_at: bundle.created_at,
      updated_at: bundle.updated_at,
      archived_at: bundle.archived_at,
    };
  }

  private toPricebookBundleItemResponse(bundleItem: PricebookBundleItemEntity, pricebookItem?: PricebookItemEntity) {
    return {
      id: bundleItem.id,
      bundle_id: bundleItem.bundle_id,
      pricebook_item_id: bundleItem.pricebook_item_id,
      default_quantity: bundleItem.default_quantity,
      sort_order: bundleItem.sort_order,
      created_by_user_id: bundleItem.created_by_user_id,
      updated_by_user_id: bundleItem.updated_by_user_id,
      deleted_by_user_id: bundleItem.deleted_by_user_id,
      created_at: bundleItem.created_at,
      updated_at: bundleItem.updated_at,
      archived_at: bundleItem.archived_at,
      pricebook_item: pricebookItem ? this.toPricebookItemResponse(pricebookItem) : null,
    };
  }

  private toPricebookBundleDetailResponse(bundle: PricebookBundleEntity) {
    const bundleItems = (bundle.items ?? [])
      .filter((item) => !item.archived_at)
      .sort((left, right) => left.sort_order - right.sort_order || left.created_at.getTime() - right.created_at.getTime())
      .map((item) => this.toPricebookBundleItemResponse(item, item.pricebook_item));

    return {
      ...this.toPricebookBundleResponse(bundle),
      items: bundleItems,
    };
  }
}