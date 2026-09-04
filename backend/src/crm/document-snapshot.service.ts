import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";

import { apiError } from "../common/api-response";
import { InvoiceLineItemEntity } from "../database/entities/invoice-line-item.entity";
import type { CustomerOutputTranslationFieldKey } from "../database/entities/customer-output-translation-record.entity";
import { PricebookBundleItemEntity } from "../database/entities/pricebook-bundle-item.entity";
import { PricebookBundleEntity } from "../database/entities/pricebook-bundle.entity";
import { PricebookItemEntity } from "../database/entities/pricebook-item.entity";
import { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";
import { CustomerOutputTranslationService } from "../language-store/customer-output-translation.service";
import { DocumentPricingService } from "./document-pricing.service";
import type { DocumentLineItemInput } from "./validation";

export type SnapshotLineDraft = {
  pricebook_item_id: string | null;
  document_line_key: string | null;
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
  pricebook_bundle_id: string | null;
  bundle_requirement_id: string | null;
  catalog_unit_price_cents_snapshot: number | null;
  quantity: string;
  line_subtotal_cents: number;
  sort_order: number;
};

export type DocumentLineReplacementOptions = {
  manager?: EntityManager;
  afterLineDelete?: (manager: EntityManager) => void | Promise<void>;
};

type SnapshotDocumentKind = "quote" | "invoice";
type SnapshotDocumentContext = {
  organizationId: string;
  documentKind: SnapshotDocumentKind;
  documentId: string | null;
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
    private readonly customerOutputTranslationService: CustomerOutputTranslationService,
  ) {}

  async replaceInvoiceLineItems(
    invoiceId: string,
    lineDrafts: SnapshotLineDraft[],
    options?: DocumentLineReplacementOptions,
  ) {
    const lineItemsRepository = this.resolveInvoiceLineItemsRepository(options?.manager);
    await lineItemsRepository.delete({ invoice_id: invoiceId });

    if (options?.afterLineDelete && options.manager) {
      await options.afterLineDelete(options.manager);
    }

    if (lineDrafts.length === 0) {
      return [];
    }

    return lineItemsRepository.save(
      lineDrafts.map((lineDraft) =>
        lineItemsRepository.create({
          invoice_id: invoiceId,
          ...lineDraft,
        }),
      ),
    );
  }

  async replaceQuoteLineItems(
    quoteId: string,
    lineDrafts: SnapshotLineDraft[],
    options?: DocumentLineReplacementOptions,
  ) {
    const lineItemsRepository = this.resolveQuoteLineItemsRepository(options?.manager);
    await lineItemsRepository.delete({ quote_id: quoteId });

    if (options?.afterLineDelete && options.manager) {
      await options.afterLineDelete(options.manager);
    }

    if (lineDrafts.length === 0) {
      return [];
    }

    return lineItemsRepository.save(
      lineDrafts.map((lineDraft) =>
        lineItemsRepository.create({
          quote_id: quoteId,
          ...lineDraft,
        }),
      ),
    );
  }

  private resolveInvoiceLineItemsRepository(manager?: EntityManager) {
    return manager?.getRepository(InvoiceLineItemEntity) ?? this.invoiceLineItemsRepository;
  }

  private resolveQuoteLineItemsRepository(manager?: EntityManager) {
    return manager?.getRepository(QuoteLineItemEntity) ?? this.quoteLineItemsRepository;
  }

  async buildLineDrafts(lineItems: DocumentLineItemInput[], context: SnapshotDocumentContext) {
    const drafts: SnapshotLineDraft[] = [];

    for (const lineItem of lineItems) {
      if (lineItem.kind === "pricebook_item") {
        drafts.push(
          await this.buildPricebookItemSnapshot(
            context,
            lineItem.documentLineKey,
            lineItem.pricebookItemId,
            lineItem.quantity,
            lineItem.sortOrder,
            lineItem.unitPriceCentsOverride,
            lineItem.nameOverride,
            lineItem.descriptionOverride,
            lineItem.nameTranslationRecordId ?? null,
            lineItem.descriptionTranslationRecordId ?? null,
            lineItem.warrantyMonthsOverride,
            lineItem.pricebookBundleId,
            lineItem.bundleRequirementId,
            lineItem.catalogUnitPriceCentsSnapshot,
          ),
        );
        continue;
      }

      if (lineItem.kind === "pricebook_bundle") {
        drafts.push(
          ...(await this.buildBundleSnapshots(
            context.organizationId,
            lineItem.pricebookBundleId,
            lineItem.sortOrder,
            lineItem.quantityMultiplier ?? "1",
          )),
        );
        continue;
      }

      drafts.push(
        await this.buildManualLineSnapshot(
          context,
          lineItem.documentLineKey,
          lineItem.name,
          lineItem.description ?? null,
          lineItem.quantity,
          lineItem.unitPriceCents,
          lineItem.sortOrder,
          lineItem.nameTranslationRecordId ?? null,
          lineItem.descriptionTranslationRecordId ?? null,
        ),
      );
    }

    return drafts;
  }

  async buildPricebookItemSnapshot(
    context: SnapshotDocumentContext,
    documentLineKey: string,
    pricebookItemId: string,
    quantity: string,
    sortOrder: number,
    unitPriceCentsOverride?: number,
    nameOverride?: string | null,
    descriptionOverride?: string | null,
    nameTranslationRecordId?: string | null,
    descriptionTranslationRecordId?: string | null,
    warrantyMonthsOverride?: number | null,
    pricebookBundleId?: string | null,
    bundleRequirementId?: string | null,
    catalogUnitPriceCentsSnapshot?: number | null,
  ): Promise<SnapshotLineDraft> {
    const item = await this.pricebookItemsRepository.findOne({
      where: {
        id: pricebookItemId,
        organization_id: context.organizationId,
      },
    });

    if (!item || !item.is_active || item.archived_at) {
      apiError(404, "pricebook_item_not_found", "The selected pricebook item could not be found.");
    }

    const unitPriceCents = unitPriceCentsOverride ?? item.customer_price_cents;
    const authoredName = nameOverride ?? item.name;
    const authoredDescription = descriptionOverride === undefined ? item.customer_description : descriptionOverride;
    const [nameSnapshot, descriptionSnapshot] = await Promise.all([
      this.resolveCustomerFacingText({
        context,
        documentLineKey,
        fieldKey: "name",
        authoredText: authoredName,
        translationRecordId: nameTranslationRecordId ?? null,
      }),
      this.resolveCustomerFacingText({
        context,
        documentLineKey,
        fieldKey: "description",
        authoredText: authoredDescription,
        translationRecordId: descriptionTranslationRecordId ?? null,
      }),
    ]);

    return {
      pricebook_item_id: item.id,
      document_line_key: documentLineKey,
      sku_snapshot: item.internal_sku,
      name_snapshot: nameSnapshot ?? authoredName,
      description_snapshot: descriptionSnapshot,
      item_type_snapshot: item.item_type,
      unit_of_measure_snapshot: item.unit_of_measure,
      unit_price_cents_snapshot: unitPriceCents,
      base_cost_cents_snapshot: item.base_cost_cents,
      material_cost_cents_snapshot: item.material_cost_cents,
      labor_cost_cents_snapshot: item.labor_cost_cents,
      estimated_labor_minutes_snapshot: item.estimated_labor_minutes,
      warranty_months_snapshot: warrantyMonthsOverride !== undefined ? warrantyMonthsOverride : item.warranty_months,
      pricebook_bundle_id: pricebookBundleId ?? null,
      bundle_requirement_id: bundleRequirementId ?? null,
      catalog_unit_price_cents_snapshot: catalogUnitPriceCentsSnapshot ?? null,
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
          document_line_key: null,
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
          pricebook_bundle_id: null,
          bundle_requirement_id: null,
          catalog_unit_price_cents_snapshot: null,
          quantity,
          line_subtotal_cents: this.documentPricingService.computeLineSubtotal(
            quantity,
            item.customer_price_cents,
          ),
          sort_order: sortOrder + index,
        };
      });
  }

  async buildManualLineSnapshot(
    context: SnapshotDocumentContext,
    documentLineKey: string,
    name: string,
    description: string | null,
    quantity: string,
    unitPriceCents: number,
    sortOrder: number,
    nameTranslationRecordId?: string | null,
    descriptionTranslationRecordId?: string | null,
  ): Promise<SnapshotLineDraft> {
    const [nameSnapshot, descriptionSnapshot] = await Promise.all([
      this.resolveCustomerFacingText({
        context,
        documentLineKey,
        fieldKey: "name",
        authoredText: name,
        translationRecordId: nameTranslationRecordId ?? null,
      }),
      this.resolveCustomerFacingText({
        context,
        documentLineKey,
        fieldKey: "description",
        authoredText: description,
        translationRecordId: descriptionTranslationRecordId ?? null,
      }),
    ]);

    return {
      pricebook_item_id: null,
      document_line_key: documentLineKey,
      sku_snapshot: "MANUAL",
      name_snapshot: nameSnapshot ?? name,
      description_snapshot: descriptionSnapshot,
      item_type_snapshot: "manual",
      unit_of_measure_snapshot: null,
      unit_price_cents_snapshot: unitPriceCents,
      base_cost_cents_snapshot: null,
      material_cost_cents_snapshot: null,
      labor_cost_cents_snapshot: null,
      estimated_labor_minutes_snapshot: null,
      warranty_months_snapshot: null,
      pricebook_bundle_id: null,
      bundle_requirement_id: null,
      catalog_unit_price_cents_snapshot: null,
      quantity,
      line_subtotal_cents: this.documentPricingService.computeLineSubtotal(quantity, unitPriceCents),
      sort_order: sortOrder,
    };
  }

  private async resolveCustomerFacingText(input: {
    context: SnapshotDocumentContext;
    documentLineKey: string;
    fieldKey: CustomerOutputTranslationFieldKey;
    authoredText: string | null;
    translationRecordId: string | null;
  }) {
    if (!input.translationRecordId) {
      return input.authoredText;
    }

    if (!input.context.documentId) {
      apiError(
        409,
        "translation_document_save_required",
        "Save the document before applying finalized customer English output to line items.",
      );
    }

    const record = await this.customerOutputTranslationService.requireFinalizedDocumentTranslation({
      organizationId: input.context.organizationId,
      documentKind: input.context.documentKind,
      documentId: input.context.documentId,
      documentLineKey: input.documentLineKey,
      fieldKey: input.fieldKey,
      recordId: input.translationRecordId,
    });
    const finalText = record.final_text ?? record.translated_text;
    const comparableAuthored = normalizeComparableText(input.authoredText);
    const comparableSource = normalizeComparableText(record.source_text);
    const comparableFinal = normalizeComparableText(finalText);

    if (
      comparableAuthored.length > 0
      && comparableAuthored !== comparableSource
      && comparableAuthored !== comparableFinal
    ) {
      apiError(
        409,
        "translation_record_source_mismatch",
        "The selected customer English output is out of date for the current line text.",
      );
    }

    return finalText;
  }

  private multiplyQuantities(leftQuantity: string, rightQuantity: string) {
    const multipliedQuantity = Number(leftQuantity) * Number(rightQuantity);

    if (!Number.isFinite(multipliedQuantity) || multipliedQuantity <= 0) {
      throw new Error("Bundle quantity must be greater than zero.");
    }

    return multipliedQuantity.toFixed(3).replace(/\.000$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }
}

function normalizeComparableText(value: string | null) {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}