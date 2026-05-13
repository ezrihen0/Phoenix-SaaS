import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";
import { DocumentPricingService } from "./document-pricing.service";
import type { DocumentLineItemInput } from "./validation";

type SnapshotLineDraft = {
  pricebook_item_id: string | null;
  sku_snapshot: string;
  name_snapshot: string;
  description_snapshot: string | null;
  item_type_snapshot: string;
  unit_of_measure_snapshot: string | null;
  unit_price_cents_snapshot: number;
  base_cost_cents_snapshot: number | null;
  material_cost_cents_snapshot: number | null;
  labor_cost_cents_snapshot: number | null;
  estimated_labor_minutes_snapshot: number | null;
  warranty_months_snapshot: number | null;
  quantity: string;
  line_subtotal_cents: number;
  sort_order: number;
};

@Injectable()
export class DocumentSnapshotService {
  constructor(
    @InjectRepository(InvoiceLineItemEntity)
    private readonly invoiceLineItemsRepository: Repository<InvoiceLineItemEntity>,
    @InjectRepository(QuoteLineItemEntity)
    private readonly quoteLineItemsRepository: Repository<QuoteLineItemEntity>,
    @InjectRepository(PricebookItemEntity)
    private readonly pricebookItemsRepository: Repository<PricebookItemEntity>,
    @InjectRepository(PricebookBundleEntity)
    private readonly pricebookBundlesRepository: Repository<PricebookBundleEntity>,
    @InjectRepository(PricebookBundleItemEntity)
    private readonly pricebookBundleItemsRepository: Repository<PricebookBundleItemEntity>,
    private readonly documentPricingService: DocumentPricingService,
  ) {}

  async replaceInvoiceLineItems(invoiceId: string, lineDrafts: SnapshotLineDraft[]) {
    await this.invoiceLineItemsRepository.delete({ invoice_id: invoiceId });

    if (lineDrafts.length === 0) {
      return [];
    }

    return this.invoiceLineItemsRepository.save(
      lineDrafts.map((lineDraft) =>
        this.invoiceLineItemsRepository.create({
          invoice_id: invoiceId,
          ...lineDraft,
        }),
      ),
    );
  }

  async replaceQuoteLineItems(quoteId: string, lineDrafts: SnapshotLineDraft[]) {
    await this.quoteLineItemsRepository.delete({ quote_id: quoteId });

    if (lineDrafts.length === 0) {
      return [];
    }

    return this.quoteLineItemsRepository.save(
      lineDrafts.map((lineDraft) =>
        this.quoteLineItemsRepository.create({
          quote_id: quoteId,
          ...lineDraft,
        }),
      ),
    );
  }

  async buildLineDrafts(lineItems: DocumentLineItemInput[], organizationId: string) {
    const drafts: SnapshotLineDraft[] = [];

    for (const lineItem of lineItems) {
      if (lineItem.kind === "pricebook_item") {
        drafts.push(
          await this.buildPricebookItemSnapshot(
            organizationId,
            lineItem.pricebookItemId,
            lineItem.quantity,
            lineItem.sortOrder,
            lineItem.unitPriceCentsOverride,
            lineItem.descriptionOverride,
          ),
        );
        continue;
      }

      if (lineItem.kind === "pricebook_bundle") {
        drafts.push(
          ...(await this.buildBundleSnapshots(
            organizationId,
            lineItem.pricebookBundleId,
            lineItem.sortOrder,
            lineItem.quantityMultiplier ?? "1",
          )),
        );
        continue;
      }

      drafts.push(
        this.buildManualLineSnapshot(
          lineItem.name,
          lineItem.description ?? null,
          lineItem.quantity,
          lineItem.unitPriceCents,
          lineItem.sortOrder,
        ),
      );
    }

    return drafts;
  }

  async buildPricebookItemSnapshot(
    organizationId: string,
    pricebookItemId: string,
    quantity: string,
    sortOrder: number,
    unitPriceCentsOverride?: number,
    descriptionOverride?: string | null,
  ): Promise<SnapshotLineDraft> {
    const item = await this.pricebookItemsRepository.findOne({
      where: {
        id: pricebookItemId,
        organization_id: organizationId,
      },
    });

    if (!item || !item.is_active || item.archived_at) {
      apiError(404, "pricebook_item_not_found", "The selected pricebook item could not be found.");
    }

    const unitPriceCents = unitPriceCentsOverride ?? item.customer_price_cents;

    return {
      pricebook_item_id: item.id,
      sku_snapshot: item.internal_sku,
      name_snapshot: item.name,
      description_snapshot: descriptionOverride ?? item.customer_description,
      item_type_snapshot: item.item_type,
      unit_of_measure_snapshot: item.unit_of_measure,
      unit_price_cents_snapshot: unitPriceCents,
      base_cost_cents_snapshot: item.base_cost_cents,
      material_cost_cents_snapshot: item.material_cost_cents,
      labor_cost_cents_snapshot: item.labor_cost_cents,
      estimated_labor_minutes_snapshot: item.estimated_labor_minutes,
      warranty_months_snapshot: item.warranty_months,
      quantity,
      line_subtotal_cents: this.documentPricingService.computeLineSubtotal(quantity, unitPriceCents),
      sort_order: sortOrder,
    };
  }

  async buildBundleSnapshots(
    organizationId: string,
    pricebookBundleId: string,
    sortOrder: number,
    quantityMultiplier = "1",
  ): Promise<SnapshotLineDraft[]> {
    const bundle = await this.pricebookBundlesRepository.findOne({
      where: {
        id: pricebookBundleId,
        organization_id: organizationId,
      },
    });

    if (!bundle || !bundle.is_active || bundle.archived_at) {
      apiError(404, "pricebook_bundle_not_found", "The selected pricebook bundle could not be found.");
    }

    const bundleItems = await this.pricebookBundleItemsRepository.find({
      where: {
        bundle_id: pricebookBundleId,
      },
      relations: {
        pricebook_item: true,
      },
      order: {
        sort_order: "ASC",
        created_at: "ASC",
      },
    });

    return bundleItems
      .filter((bundleItem) => !bundleItem.archived_at && bundleItem.pricebook_item)
      .map((bundleItem, index) => {
        const item = bundleItem.pricebook_item as PricebookItemEntity;

        if (item.organization_id !== organizationId) {
          apiError(
            400,
            "pricebook_bundle_item_org_mismatch",
            "This bundle references a catalog item that does not belong to your organization.",
          );
        }

        if (!item.is_active || item.archived_at) {
          apiError(400, "pricebook_bundle_item_unavailable", "One or more bundle items are no longer available.");
        }

        const quantity = this.multiplyQuantities(bundleItem.default_quantity, quantityMultiplier);

        return {
          pricebook_item_id: item.id,
          sku_snapshot: item.internal_sku,
          name_snapshot: item.name,
          description_snapshot: item.customer_description,
          item_type_snapshot: item.item_type,
          unit_of_measure_snapshot: item.unit_of_measure,
          unit_price_cents_snapshot: item.customer_price_cents,
          base_cost_cents_snapshot: item.base_cost_cents,
          material_cost_cents_snapshot: item.material_cost_cents,
          labor_cost_cents_snapshot: item.labor_cost_cents,
          estimated_labor_minutes_snapshot: item.estimated_labor_minutes,
          warranty_months_snapshot: item.warranty_months,
          quantity,
          line_subtotal_cents: this.documentPricingService.computeLineSubtotal(
            quantity,
            item.customer_price_cents,
          ),
          sort_order: sortOrder + index,
        };
      });
  }

  buildManualLineSnapshot(
    name: string,
    description: string | null,
    quantity: string,
    unitPriceCents: number,
    sortOrder: number,
  ): SnapshotLineDraft {
    return {
      pricebook_item_id: null,
      sku_snapshot: "MANUAL",
      name_snapshot: name,
      description_snapshot: description,
      item_type_snapshot: "manual",
      unit_of_measure_snapshot: null,
      unit_price_cents_snapshot: unitPriceCents,
      base_cost_cents_snapshot: null,
      material_cost_cents_snapshot: null,
      labor_cost_cents_snapshot: null,
      estimated_labor_minutes_snapshot: null,
      warranty_months_snapshot: null,
      quantity,
      line_subtotal_cents: this.documentPricingService.computeLineSubtotal(quantity, unitPriceCents),
      sort_order: sortOrder,
    };
  }

  private multiplyQuantities(leftQuantity: string, rightQuantity: string) {
    const multipliedQuantity = Number(leftQuantity) * Number(rightQuantity);

    if (!Number.isFinite(multipliedQuantity) || multipliedQuantity <= 0) {
      throw new Error("Bundle quantity must be greater than zero.");
    }

    return multipliedQuantity.toFixed(3).replace(/\.000$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }
}