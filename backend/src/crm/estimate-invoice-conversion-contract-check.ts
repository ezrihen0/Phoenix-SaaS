import assert from "node:assert/strict";

import { DocumentPricingService } from "./document-pricing.service";
import { DocumentSnapshotService } from "./document-snapshot.service";
import { MoneyEngineService } from "./money-engine.service";
import type { QuoteLineItemEntity } from "../database/entities/quote-line-item.entity";

function expect(name: string, run: () => void) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

function buildHarness() {
  const moneyEngineService = new MoneyEngineService();
  const documentPricingService = new DocumentPricingService(moneyEngineService);
  const documentSnapshotService = new DocumentSnapshotService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    documentPricingService,
    {} as never,
  );

  return { documentSnapshotService };
}

expect("copyQuoteLineSnapshots preserves estimate unit price snapshot", () => {
  const { documentSnapshotService } = buildHarness();
  const quoteLine = {
    id: "line-1",
    quote_id: "quote-1",
    pricebook_item_id: "pb-1",
    document_line_key: "est-line-a",
    sku_snapshot: "SKU-1",
    name_snapshot: "Approved line",
    description_snapshot: "Frozen description",
    item_type_snapshot: "service",
    unit_of_measure_snapshot: "each",
    unit_price_cents_snapshot: 12_345,
    base_cost_cents_snapshot: null,
    material_cost_cents_snapshot: null,
    labor_cost_cents_snapshot: null,
    estimated_labor_minutes_snapshot: null,
    warranty_months_snapshot: 12,
    pricebook_bundle_id: null,
    bundle_requirement_id: null,
    catalog_unit_price_cents_snapshot: 9_999,
    quantity: "2.5",
    line_subtotal_cents: 30_862,
    sort_order: 0,
    created_at: new Date(),
    updated_at: new Date(),
  } as QuoteLineItemEntity;

  const drafts = documentSnapshotService.copyQuoteLineSnapshotsToInvoiceDrafts([quoteLine]);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.unit_price_cents_snapshot, 12_345);
  assert.equal(drafts[0]?.name_snapshot, "Approved line");
  assert.equal(drafts[0]?.catalog_unit_price_cents_snapshot, 9_999);
  assert.equal(drafts[0]?.line_subtotal_cents, 30_862);
});

console.log("estimate-invoice-conversion-contract-check complete");
