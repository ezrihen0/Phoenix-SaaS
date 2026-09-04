import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleRequirementEntity } from "../database/entities/pricebook-bundle-requirement.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookCategoryEntity } from "../database/entities/pricebook-category.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { PricebookSystemEntity } from "../database/entities/pricebook-system.entity";
import { createReadStream } from "node:fs";
import { join } from "node:path";

import {
  DEFAULT_PRICEBOOK_SYSTEMS,
  GAS_PRICEBOOK_CATEGORIES,
  GAS_SAMPLE_ITEMS,
} from "./pricebook-catalog-bootstrap";
import { pricebookImageUploadsRoot, writePricebookImageFile } from "./pricebook-image";
import {
  persistWarrantyMonths,
  type CreatePricebookBundleItemPayload,
  type CreatePricebookBundlePayload,
  type CreatePricebookBundleRequirementPayload,
  type CreatePricebookItemPayload,
  type PricebookBundleListQuery,
  type PricebookCategoryListQuery,
  type PricebookItemListQuery,
  type PricebookNavigationSummaryQuery,
  type UpdatePricebookBundleItemPayload,
  type UpdatePricebookBundlePayload,
  type UpdatePricebookBundleRequirementPayload,
  type UpdatePricebookItemPayload,
} from "./validation";

@Injectable()
export class PricebookService {
  constructor(
    @InjectRepository(PricebookItemEntity)
    private readonly pricebookItemRepository: Repository<PricebookItemEntity>,
    @InjectRepository(PricebookCategoryEntity)
    private readonly pricebookCategoryRepository: Repository<PricebookCategoryEntity>,
    @InjectRepository(PricebookSystemEntity)
    private readonly pricebookSystemRepository: Repository<PricebookSystemEntity>,
    @InjectRepository(PricebookBundleEntity)
    private readonly pricebookBundleRepository: Repository<PricebookBundleEntity>,
    @InjectRepository(PricebookBundleItemEntity)
    private readonly pricebookBundleItemRepository: Repository<PricebookBundleItemEntity>,
    @InjectRepository(PricebookBundleRequirementEntity)
    private readonly pricebookBundleRequirementRepository: Repository<PricebookBundleRequirementEntity>,
  ) {}

  async listItems(organizationId: string, query: PricebookItemListQuery) {
    const itemQuery = this.pricebookItemRepository.createQueryBuilder("item");
    itemQuery.leftJoinAndSelect("item.category", "category");
    itemQuery.leftJoinAndSelect("category.system", "system");
    itemQuery.where("item.organization_id = :organizationId", { organizationId });

    this.applySharedItemFilters(itemQuery, query);

    if (query.systemId) {
      itemQuery.andWhere("category.system_id = :systemId", { systemId: query.systemId });
    }

    if (query.categoryId) {
      itemQuery.andWhere("item.category_id = :categoryId", { categoryId: query.categoryId });
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

  async listNavigationSummary(organizationId: string, query: PricebookNavigationSummaryQuery) {
    const totalCount = await this.createFilteredItemCountQuery(organizationId, query).getCount();

    const systemCountRows = await this.createFilteredItemCountQuery(organizationId, query)
      .leftJoin("item.category", "category")
      .leftJoin("category.system", "system")
      .select("system.id", "id")
      .addSelect("COUNT(item.id)", "itemCount")
      .groupBy("system.id")
      .getRawMany<{ id: string; itemCount: string }>();

    const categoryCountRows = await this.createFilteredItemCountQuery(organizationId, query)
      .leftJoin("item.category", "category")
      .select("category.id", "id")
      .addSelect("COUNT(item.id)", "itemCount")
      .groupBy("category.id")
      .getRawMany<{ id: string; itemCount: string }>();

    const systemCountById = new Map(
      systemCountRows.map((row) => [row.id, Number.parseInt(row.itemCount, 10) || 0]),
    );
    const categoryCountById = new Map(
      categoryCountRows.map((row) => [row.id, Number.parseInt(row.itemCount, 10) || 0]),
    );

    const systems = (await this.listSystems(organizationId)).systems.map((system) => ({
      ...system,
      item_count: systemCountById.get(system.id) ?? 0,
    }));

    const categories = (await this.listCategories(organizationId, {})).categories.map((category) => ({
      ...category,
      item_count: categoryCountById.get(category.id) ?? 0,
    }));

    return {
      total_count: totalCount,
      systems,
      categories,
    };
  }

  async listSystems(organizationId: string) {
    const rows = await this.pricebookSystemRepository.find({
      where: {
        organization_id: organizationId,
        archived_at: IsNull(),
      },
      order: { name: "ASC" },
    });

    return {
      systems: rows.map((system) => this.toPricebookSystemResponse(system)),
    };
  }

  async bootstrapCatalog(organizationId: string, actorUserId: string | null) {
    const result = await this.bootstrapCatalogStructuresOnly(organizationId, actorUserId);
    const gasSystem = result.systems.find((system) => system.code === "gas");

    if (!gasSystem) {
      apiError(500, "pricebook_bootstrap_failed", "Gas system could not be created.");
    }

    const categoryByName = new Map(result.categories.map((category) => [category.name, category]));
    let itemsCreated = 0;

    for (const sample of GAS_SAMPLE_ITEMS) {
      const category = categoryByName.get(sample.category);

      if (!category) {
        continue;
      }

      const existingItem = await this.pricebookItemRepository.findOne({
        where: {
          organization_id: organizationId,
          name: sample.name,
          category_id: category.id,
        },
        select: { id: true },
      });

      if (existingItem) {
        continue;
      }

      await this.createItem(organizationId, {
        internalSku: null,
        name: sample.name,
        customerDescription: null,
        internalDescription: null,
        itemType: sample.category === "Gas Labor & Services" ? "service" : "product",
        systemId: gasSystem.id,
        categoryId: category.id,
        categoryName: null,
        tradeArea: null,
        serviceArea: null,
        tags: [],
        unitOfMeasure: "each",
        baseCostCents: 0,
        materialCostCents: 0,
        laborCostCents: 0,
        customerPriceCents: sample.customerPriceCents,
        minimumPriceCents: null,
        estimatedLaborMinutes: null,
        warrantyMonths: null,
        requiresPermit: false,
        inventoryTrackingMode: sample.category === "Gas Labor & Services" ? "none" : "future_tracked",
        supplierName: null,
        supplierSku: null,
        inventoryNotes: null,
        isPopular: false,
        isActive: true,
        sortOrder: 0,
        image: null,
      }, actorUserId);
      itemsCreated += 1;
    }

    return {
      systems: result.systems.map((system) => this.toPricebookSystemResponse(system)),
      categoriesCreated: result.categories.length,
      itemsCreated,
    };
  }

  async bootstrapCatalogStructuresOnly(organizationId: string, actorUserId: string | null) {
    const systems: PricebookSystemEntity[] = [];

    for (const definition of DEFAULT_PRICEBOOK_SYSTEMS) {
      systems.push(await this.findOrCreateSystem(organizationId, definition.code, definition.name, actorUserId));
    }

    const gasSystem = systems.find((system) => system.code === "gas");

    if (!gasSystem) {
      apiError(500, "pricebook_bootstrap_failed", "Gas system could not be created.");
    }

    const categories: PricebookCategoryEntity[] = [];

    for (const categoryName of GAS_PRICEBOOK_CATEGORIES) {
      categories.push(await this.findOrCreateCategory(organizationId, gasSystem.id, categoryName, actorUserId));
    }

    return { systems, categories };
  }

  async listCategories(organizationId: string, query: PricebookCategoryListQuery) {
    const categoryQuery = this.pricebookCategoryRepository.createQueryBuilder("category");
    categoryQuery.leftJoinAndSelect("category.system", "system");
    categoryQuery.where("category.organization_id = :organizationId", { organizationId });
    categoryQuery.andWhere("category.archived_at IS NULL");

    if (query.systemId) {
      categoryQuery.andWhere("category.system_id = :systemId", { systemId: query.systemId });
    }

    categoryQuery.orderBy("category.name", "ASC");

    const rows = await categoryQuery.getMany();

    return {
      categories: rows.map((category) => this.toPricebookCategoryResponse(category)),
    };
  }

  async createItem(organizationId: string, payload: CreatePricebookItemPayload, actorUserId: string | null) {
    let internalSku = payload.internalSku;

    if (internalSku) {
      await this.ensureSkuIsUnique(organizationId, internalSku);
    } else {
      internalSku = await this.generateCatalogSku(organizationId, payload.name);
    }

    const category = await this.resolveCategory(
      organizationId,
      payload.systemId,
      payload.categoryId,
      payload.categoryName,
      actorUserId,
    );

    const item = this.pricebookItemRepository.create({
      organization_id: organizationId,
      internal_sku: internalSku,
      name: payload.name,
      customer_description: payload.customerDescription,
      internal_description: payload.internalDescription,
      item_type: payload.itemType,
      category_id: category.id,
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
      warranty_months: persistWarrantyMonths(payload.warrantyMonths) ?? null,
      requires_permit: payload.requiresPermit,
      inventory_tracking_mode: payload.inventoryTrackingMode,
      supplier_name: payload.supplierName,
      supplier_sku: payload.supplierSku,
      inventory_notes: payload.inventoryNotes,
      image_storage_key: null,
      is_popular: payload.isPopular,
      is_active: payload.isActive,
      sort_order: payload.sortOrder,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: payload.isActive ? null : new Date(),
    });

    const saved = await this.pricebookItemRepository.save(item);

    if (payload.image) {
      saved.image_storage_key = await writePricebookImageFile(organizationId, saved.id, payload.image);
      await this.pricebookItemRepository.save(saved);
    }

    saved.category = category;
    return this.toPricebookItemResponse(saved);
  }

  async getItem(organizationId: string, itemId: string) {
    return this.toPricebookItemResponse(await this.loadItemOrFail(organizationId, itemId));
  }

  async getItemImage(organizationId: string, itemId: string) {
    const item = await this.loadItemOrFail(organizationId, itemId);
    const storageKey = item.image_storage_key;

    if (!storageKey || storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\")) {
      apiError(404, "pricebook_item_image_not_found", "This pricebook item does not have an image.");
    }

    const contentType = storageKey.endsWith(".png")
      ? "image/png"
      : storageKey.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";

    return {
      stream: createReadStream(join(pricebookImageUploadsRoot(), storageKey)),
      contentType,
    };
  }

  async updateItem(organizationId: string, itemId: string, payload: UpdatePricebookItemPayload, actorUserId: string | null) {
    const item = await this.loadItemOrFail(organizationId, itemId);

    if (payload.internalSku && payload.internalSku !== item.internal_sku) {
      await this.ensureSkuIsUnique(organizationId, payload.internalSku, item.id);
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

    if (payload.categoryId !== undefined || payload.categoryName !== undefined) {
      if (!payload.categoryId && !payload.categoryName) {
        item.category_id = null;
        item.category = null;
      } else {
        const category = await this.resolveCategory(
          organizationId,
          payload.systemId ?? null,
          payload.categoryId ?? null,
          payload.categoryName ?? null,
          actorUserId,
        );
        item.category_id = category.id;
        item.category = category;
      }
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
      item.warranty_months = persistWarrantyMonths(payload.warrantyMonths) ?? null;
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

  async duplicateItem(organizationId: string, itemId: string, actorUserId: string | null) {
    const sourceItem = await this.loadItemOrFail(organizationId, itemId);
    const duplicatedSku = await this.generateDuplicateSku(organizationId, sourceItem.internal_sku);

    const duplicatedItem = this.pricebookItemRepository.create({
      organization_id: organizationId,
      internal_sku: duplicatedSku,
      name: `${sourceItem.name} Copy`,
      customer_description: sourceItem.customer_description,
      internal_description: sourceItem.internal_description,
      item_type: sourceItem.item_type,
      category_id: sourceItem.category_id,
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

    const savedDuplicate = await this.pricebookItemRepository.save(duplicatedItem);
    savedDuplicate.category = sourceItem.category ?? null;
    return this.toPricebookItemResponse(savedDuplicate);
  }

  async archiveItem(organizationId: string, itemId: string, actorUserId: string | null) {
    const item = await this.loadItemOrFail(organizationId, itemId);
    item.is_active = false;
    item.archived_at = item.archived_at ?? new Date();
    item.deleted_by_user_id = actorUserId;
    item.updated_by_user_id = actorUserId;

    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(item));
  }

  async restoreItem(organizationId: string, itemId: string, actorUserId: string | null) {
    const item = await this.loadItemOrFail(organizationId, itemId);
    item.is_active = true;
    item.archived_at = null;
    item.deleted_by_user_id = null;
    item.updated_by_user_id = actorUserId;

    return this.toPricebookItemResponse(await this.pricebookItemRepository.save(item));
  }

  async listBundles(organizationId: string, query: PricebookBundleListQuery) {
    const bundleQuery = this.pricebookBundleRepository.createQueryBuilder("bundle");
    bundleQuery.where("bundle.organization_id = :organizationId", { organizationId });

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

  async createBundle(organizationId: string, payload: CreatePricebookBundlePayload, actorUserId: string | null) {
    const bundle = this.pricebookBundleRepository.create({
      organization_id: organizationId,
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

  async getBundle(organizationId: string, bundleId: string) {
    const bundle = await this.loadBundleWithDetailsOrFail(organizationId, bundleId);
    return this.toPricebookBundleDetailResponse(bundle);
  }

  async updateBundle(
    organizationId: string,
    bundleId: string,
    payload: UpdatePricebookBundlePayload,
    actorUserId: string | null,
  ) {
    const bundle = await this.loadBundleOrFail(organizationId, bundleId);

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

  async archiveBundle(organizationId: string, bundleId: string, actorUserId: string | null) {
    const bundle = await this.loadBundleOrFail(organizationId, bundleId);
    bundle.is_active = false;
    bundle.archived_at = bundle.archived_at ?? new Date();
    bundle.deleted_by_user_id = actorUserId;
    bundle.updated_by_user_id = actorUserId;

    return this.toPricebookBundleResponse(await this.pricebookBundleRepository.save(bundle));
  }

  async restoreBundle(organizationId: string, bundleId: string, actorUserId: string | null) {
    const bundle = await this.loadBundleOrFail(organizationId, bundleId);
    bundle.is_active = true;
    bundle.archived_at = null;
    bundle.deleted_by_user_id = null;
    bundle.updated_by_user_id = actorUserId;

    return this.toPricebookBundleResponse(await this.pricebookBundleRepository.save(bundle));
  }

  async addItemToBundle(
    organizationId: string,
    bundleId: string,
    payload: CreatePricebookBundleItemPayload,
    actorUserId: string | null,
  ) {
    const bundle = await this.loadBundleOrFail(organizationId, bundleId);

    if (!bundle.is_active || bundle.archived_at) {
      apiError(409, "pricebook_bundle_archived", "Archived bundles cannot be modified.");
    }

    const pricebookItem = await this.loadItemOrFail(organizationId, payload.pricebookItemId);

    if (!pricebookItem.is_active || pricebookItem.archived_at) {
      apiError(409, "pricebook_item_archived", "Archived pricebook items cannot be added to a bundle.");
    }

    const existingMembership = await this.pricebookBundleItemRepository.findOne({
      where: {
        organization_id: organizationId,
        bundle_id: bundleId,
        pricebook_item_id: payload.pricebookItemId,
        archived_at: IsNull(),
      },
    });

    if (existingMembership) {
      apiError(409, "pricebook_bundle_item_duplicate", "This pricebook item is already in the bundle.");
    }

    const bundleItem = this.pricebookBundleItemRepository.create({
      organization_id: organizationId,
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
    organizationId: string,
    bundleId: string,
    bundleItemId: string,
    payload: UpdatePricebookBundleItemPayload,
    actorUserId: string | null,
  ) {
    const bundleItem = await this.loadBundleItemOrFail(organizationId, bundleId, bundleItemId);

    if (payload.defaultQuantity !== undefined) {
      bundleItem.default_quantity = payload.defaultQuantity;
    }

    if (payload.sortOrder !== undefined) {
      bundleItem.sort_order = payload.sortOrder;
    }

    bundleItem.updated_by_user_id = actorUserId;

    const saved = await this.pricebookBundleItemRepository.save(bundleItem);
    const pricebookItem = saved.pricebook_item ?? await this.loadItemOrFail(organizationId, saved.pricebook_item_id);
    return this.toPricebookBundleItemResponse(saved, pricebookItem);
  }

  async removeBundleItem(organizationId: string, bundleId: string, bundleItemId: string, actorUserId: string | null) {
    const bundleItem = await this.loadBundleItemOrFail(organizationId, bundleId, bundleItemId);
    bundleItem.archived_at = bundleItem.archived_at ?? new Date();
    bundleItem.deleted_by_user_id = actorUserId;
    bundleItem.updated_by_user_id = actorUserId;

    const saved = await this.pricebookBundleItemRepository.save(bundleItem);
    const pricebookItem = saved.pricebook_item ?? await this.loadItemOrFail(organizationId, saved.pricebook_item_id);
    return this.toPricebookBundleItemResponse(saved, pricebookItem);
  }

  async listBundleRequirements(organizationId: string, bundleId: string) {
    await this.loadBundleOrFail(organizationId, bundleId);

    const requirements = await this.pricebookBundleRequirementRepository.find({
      where: {
        organization_id: organizationId,
        bundle_id: bundleId,
        archived_at: IsNull(),
      },
      relations: {
        category: {
          system: true,
        },
      },
      order: {
        sort_order: "ASC",
        created_at: "ASC",
      },
    });

    return {
      requirements: requirements.map((requirement) => this.toPricebookBundleRequirementResponse(requirement)),
    };
  }

  async addBundleRequirement(
    organizationId: string,
    bundleId: string,
    payload: CreatePricebookBundleRequirementPayload,
    actorUserId: string | null,
  ) {
    const bundle = await this.loadBundleOrFail(organizationId, bundleId);

    if (!bundle.is_active || bundle.archived_at) {
      apiError(409, "pricebook_bundle_archived", "Archived bundles cannot be modified.");
    }

    const category = await this.loadCategoryOrFail(organizationId, payload.categoryId);

    const existingRequirement = await this.pricebookBundleRequirementRepository.findOne({
      where: {
        organization_id: organizationId,
        bundle_id: bundleId,
        category_id: payload.categoryId,
        archived_at: IsNull(),
      },
    });

    if (existingRequirement) {
      apiError(409, "pricebook_bundle_requirement_duplicate", "This category is already required by the bundle.");
    }

    const requirement = this.pricebookBundleRequirementRepository.create({
      organization_id: organizationId,
      bundle_id: bundleId,
      label: payload.label,
      category_id: payload.categoryId,
      default_quantity: payload.defaultQuantity,
      sort_order: payload.sortOrder,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: null,
    });

    return this.toPricebookBundleRequirementResponse(
      await this.pricebookBundleRequirementRepository.save(requirement),
      category,
    );
  }

  async updateBundleRequirement(
    organizationId: string,
    bundleId: string,
    requirementId: string,
    payload: UpdatePricebookBundleRequirementPayload,
    actorUserId: string | null,
  ) {
    const requirement = await this.loadBundleRequirementOrFail(organizationId, bundleId, requirementId);

    if (payload.label !== undefined) {
      requirement.label = payload.label;
    }

    if (payload.categoryId !== undefined) {
      const category = await this.loadCategoryOrFail(organizationId, payload.categoryId);

      if (payload.categoryId !== requirement.category_id) {
        const existingRequirement = await this.pricebookBundleRequirementRepository.findOne({
          where: {
            organization_id: organizationId,
            bundle_id: bundleId,
            category_id: payload.categoryId,
            archived_at: IsNull(),
          },
        });

        if (existingRequirement && existingRequirement.id !== requirementId) {
          apiError(409, "pricebook_bundle_requirement_duplicate", "This category is already required by the bundle.");
        }
      }

      requirement.category_id = payload.categoryId;
      requirement.category = category;
    }

    if (payload.defaultQuantity !== undefined) {
      requirement.default_quantity = payload.defaultQuantity;
    }

    if (payload.sortOrder !== undefined) {
      requirement.sort_order = payload.sortOrder;
    }

    requirement.updated_by_user_id = actorUserId;

    const saved = await this.pricebookBundleRequirementRepository.save(requirement);
    const category = saved.category ?? await this.loadCategoryOrFail(organizationId, saved.category_id);
    return this.toPricebookBundleRequirementResponse(saved, category);
  }

  async removeBundleRequirement(
    organizationId: string,
    bundleId: string,
    requirementId: string,
    actorUserId: string | null,
  ) {
    const requirement = await this.loadBundleRequirementOrFail(organizationId, bundleId, requirementId);
    requirement.archived_at = requirement.archived_at ?? new Date();
    requirement.deleted_by_user_id = actorUserId;
    requirement.updated_by_user_id = actorUserId;

    const saved = await this.pricebookBundleRequirementRepository.save(requirement);
    const category = saved.category ?? await this.loadCategoryOrFail(organizationId, saved.category_id);
    return this.toPricebookBundleRequirementResponse(saved, category);
  }

  private async loadItemOrFail(organizationId: string, itemId: string) {
    const item = await this.pricebookItemRepository.findOne({
      where: { id: itemId, organization_id: organizationId },
      relations: {
        category: {
          system: true,
        },
      },
    });

    if (!item) {
      apiError(404, "pricebook_item_not_found", "The requested pricebook item could not be found.");
    }

    return item;
  }

  private async loadBundleOrFail(organizationId: string, bundleId: string) {
    const bundle = await this.pricebookBundleRepository.findOne({ where: { id: bundleId, organization_id: organizationId } });

    if (!bundle) {
      apiError(404, "pricebook_bundle_not_found", "The requested pricebook bundle could not be found.");
    }

    return bundle;
  }

  private async loadBundleWithDetailsOrFail(organizationId: string, bundleId: string) {
    const bundle = await this.pricebookBundleRepository.findOne({
      where: { id: bundleId, organization_id: organizationId },
      relations: {
        items: {
          pricebook_item: true,
        },
        requirements: {
          category: {
            system: true,
          },
        },
      },
    });

    if (!bundle) {
      apiError(404, "pricebook_bundle_not_found", "The requested pricebook bundle could not be found.");
    }

    return bundle;
  }

  private async loadBundleItemOrFail(organizationId: string, bundleId: string, bundleItemId: string) {
    const bundleItem = await this.pricebookBundleItemRepository.findOne({
      where: {
        id: bundleItemId,
        organization_id: organizationId,
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

  private async loadCategoryOrFail(organizationId: string, categoryId: string) {
    const category = await this.pricebookCategoryRepository.findOne({
      where: { id: categoryId, organization_id: organizationId },
      relations: {
        system: true,
      },
    });

    if (!category || category.archived_at) {
      apiError(404, "pricebook_category_not_found", "The requested pricebook category could not be found.");
    }

    return category;
  }

  private async loadBundleRequirementOrFail(organizationId: string, bundleId: string, requirementId: string) {
    const requirement = await this.pricebookBundleRequirementRepository.findOne({
      where: {
        id: requirementId,
        organization_id: organizationId,
        bundle_id: bundleId,
      },
      relations: {
        category: {
          system: true,
        },
      },
    });

    if (!requirement || requirement.archived_at) {
      apiError(404, "pricebook_bundle_requirement_not_found", "The requested bundle requirement could not be found.");
    }

    return requirement;
  }

  private async ensureSkuIsUnique(organizationId: string, internalSku: string, excludeItemId?: string) {
    const existingItem = await this.pricebookItemRepository.findOne({
      where: { internal_sku: internalSku, organization_id: organizationId },
      select: { id: true, internal_sku: true },
    });

    if (existingItem && existingItem.id !== excludeItemId) {
      apiError(409, "pricebook_item_sku_conflict", "A pricebook item with that SKU already exists.");
    }
  }

  private async generateCatalogSku(organizationId: string, name: string) {
    const slug = name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "ITEM";

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const candidateSku = `PB-${slug}-${suffix}`.slice(0, 128);
      const existingCandidate = await this.pricebookItemRepository.findOne({
        where: { internal_sku: candidateSku, organization_id: organizationId },
        select: { id: true },
      });

      if (!existingCandidate) {
        return candidateSku;
      }
    }

    apiError(409, "pricebook_item_sku_exhausted", "Unable to generate a unique catalog SKU.");
  }

  private async resolveCategory(
    organizationId: string,
    systemId: string | null,
    categoryId: string | null,
    categoryName: string | null,
    actorUserId: string | null,
  ) {
    if (categoryId) {
      const existingById = await this.pricebookCategoryRepository.findOne({
        where: { id: categoryId, organization_id: organizationId },
        relations: { system: true },
      });

      if (!existingById || existingById.archived_at) {
        apiError(404, "pricebook_category_not_found", "The requested pricebook category could not be found.");
      }

      if (systemId && existingById.system_id !== systemId) {
        apiError(400, "pricebook_category_system_mismatch", "The category does not belong to the selected system.");
      }

      return existingById;
    }

    if (!categoryName) {
      apiError(400, "pricebook_category_invalid", "category is required.");
    }

    if (!systemId) {
      apiError(400, "pricebook_system_required", "systemId is required when creating a category by name.");
    }

    await this.loadSystemOrFail(organizationId, systemId);

    return this.findOrCreateCategory(organizationId, systemId, categoryName, actorUserId);
  }

  private async loadSystemOrFail(organizationId: string, systemId: string) {
    const system = await this.pricebookSystemRepository.findOne({
      where: { id: systemId, organization_id: organizationId, archived_at: IsNull() },
    });

    if (!system) {
      apiError(404, "pricebook_system_not_found", "The requested pricebook system could not be found.");
    }

    return system;
  }

  private async findOrCreateSystem(
    organizationId: string,
    code: string,
    name: string,
    actorUserId: string | null,
  ) {
    const existing = await this.pricebookSystemRepository.findOne({
      where: { organization_id: organizationId, code },
    });

    if (existing) {
      if (existing.archived_at) {
        existing.archived_at = null;
        existing.deleted_by_user_id = null;
        existing.updated_by_user_id = actorUserId;
        return this.pricebookSystemRepository.save(existing);
      }

      return existing;
    }

    const created = this.pricebookSystemRepository.create({
      organization_id: organizationId,
      code,
      name,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: null,
    });

    try {
      return await this.pricebookSystemRepository.save(created);
    } catch {
      const raced = await this.pricebookSystemRepository.findOne({
        where: { organization_id: organizationId, code },
      });

      if (raced) {
        return raced;
      }

      throw new Error("Unable to create pricebook system.");
    }
  }

  private async findCategoryByName(organizationId: string, systemId: string, name: string) {
    return this.pricebookCategoryRepository
      .createQueryBuilder("category")
      .where("category.organization_id = :organizationId", { organizationId })
      .andWhere("category.system_id = :systemId", { systemId })
      .andWhere("LOWER(category.name) = :name", { name: name.toLowerCase() })
      .getOne();
  }

  private async findOrCreateCategory(
    organizationId: string,
    systemId: string,
    name: string,
    actorUserId: string | null,
  ) {
    const existing = await this.findCategoryByName(organizationId, systemId, name);

    if (existing) {
      if (existing.archived_at) {
        existing.archived_at = null;
        existing.deleted_by_user_id = null;
        existing.updated_by_user_id = actorUserId;
        return this.pricebookCategoryRepository.save(existing);
      }

      return existing;
    }

    const created = this.pricebookCategoryRepository.create({
      organization_id: organizationId,
      system_id: systemId,
      name,
      created_by_user_id: actorUserId,
      updated_by_user_id: null,
      deleted_by_user_id: null,
      archived_at: null,
    });

    try {
      return await this.pricebookCategoryRepository.save(created);
    } catch {
      const raced = await this.findCategoryByName(organizationId, systemId, name);

      if (raced) {
        return raced;
      }

      throw new Error("Unable to create pricebook category.");
    }
  }

  private async generateDuplicateSku(organizationId: string, sourceSku: string) {
    const baseSku = sourceSku.trim();

    for (let copyIndex = 1; copyIndex <= 1000; copyIndex += 1) {
      const suffix = `-COPY-${copyIndex}`;
      const truncatedBase = baseSku.slice(0, Math.max(1, 128 - suffix.length));
      const candidateSku = `${truncatedBase}${suffix}`;
      const existingCandidate = await this.pricebookItemRepository.findOne({
        where: { internal_sku: candidateSku, organization_id: organizationId },
        select: { id: true },
      });

      if (!existingCandidate) {
        return candidateSku;
      }
    }

    apiError(409, "pricebook_item_duplicate_sku_exhausted", "Unable to generate a unique duplicate SKU.");
  }

  private createFilteredItemCountQuery(
    organizationId: string,
    query: PricebookNavigationSummaryQuery,
  ) {
    const itemQuery = this.pricebookItemRepository.createQueryBuilder("item");
    itemQuery.where("item.organization_id = :organizationId", { organizationId });
    this.applySharedItemFilters(itemQuery, query);
    return itemQuery;
  }

  private applySharedItemFilters(
    itemQuery: ReturnType<Repository<PricebookItemEntity>["createQueryBuilder"]>,
    query: Pick<
      PricebookItemListQuery,
      "activeState" | "itemType" | "tradeArea" | "popularOnly" | "q"
    > | PricebookNavigationSummaryQuery,
  ) {
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
          OR COALESCE(item.supplier_sku, '') LIKE :search
          OR COALESCE(item.supplier_name, '') LIKE :search
          OR item.name LIKE :search
          OR COALESCE(item.customer_description, '') LIKE :search
          OR COALESCE(item.internal_description, '') LIKE :search
          OR CAST(item.tags AS CHAR) LIKE :search
        )`,
        { search: `%${query.q}%` },
      );
    }
  }

  private toPricebookSystemResponse(system: PricebookSystemEntity) {
    return {
      id: system.id,
      name: system.name,
      code: system.code,
    };
  }

  private toPricebookCategoryResponse(category: PricebookCategoryEntity) {
    return {
      id: category.id,
      name: category.name,
      system_id: category.system_id,
      system: category.system ? this.toPricebookSystemResponse(category.system) : null,
    };
  }

  private toPricebookItemResponse(item: PricebookItemEntity) {
    const categoryResponse = item.category ? this.toPricebookCategoryResponse(item.category) : null;

    return {
      id: item.id,
      internal_sku: item.internal_sku,
      name: item.name,
      customer_description: item.customer_description,
      internal_description: item.internal_description,
      item_type: item.item_type,
      category_id: item.category_id,
      category: categoryResponse,
      system_id: categoryResponse?.system_id ?? null,
      system: categoryResponse?.system ?? null,
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
      image_url: item.image_storage_key ? `/api/pricebook/items/${item.id}/image` : null,
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

  private toPricebookBundleRequirementResponse(
    requirement: PricebookBundleRequirementEntity,
    category?: PricebookCategoryEntity,
  ) {
    const categoryEntity = category ?? requirement.category;

    return {
      id: requirement.id,
      bundle_id: requirement.bundle_id,
      label: requirement.label,
      category_id: requirement.category_id,
      default_quantity: requirement.default_quantity,
      sort_order: requirement.sort_order,
      created_by_user_id: requirement.created_by_user_id,
      updated_by_user_id: requirement.updated_by_user_id,
      deleted_by_user_id: requirement.deleted_by_user_id,
      created_at: requirement.created_at,
      updated_at: requirement.updated_at,
      archived_at: requirement.archived_at,
      category: categoryEntity ? this.toPricebookCategoryResponse(categoryEntity) : null,
    };
  }

  private toPricebookBundleDetailResponse(bundle: PricebookBundleEntity) {
    const bundleItems = (bundle.items ?? [])
      .filter((item) => !item.archived_at)
      .sort((left, right) => left.sort_order - right.sort_order || left.created_at.getTime() - right.created_at.getTime())
      .map((item) => this.toPricebookBundleItemResponse(item, item.pricebook_item));

    const bundleRequirements = (bundle.requirements ?? [])
      .filter((requirement) => !requirement.archived_at)
      .sort(
        (left, right) => left.sort_order - right.sort_order
          || left.created_at.getTime() - right.created_at.getTime(),
      )
      .map((requirement) => this.toPricebookBundleRequirementResponse(requirement, requirement.category));

    return {
      ...this.toPricebookBundleResponse(bundle),
      items: bundleItems,
      requirements: bundleRequirements,
    };
  }
}