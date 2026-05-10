"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Package2, Search, Wrench } from "lucide-react";

import { loadPricebookBundleDetail, usePricebookSearch } from "@/lib/crm/use-pricebook-search";
import {
  formatCurrencyFromCents,
  type PricebookBundle,
  type PricebookBundleDetail,
  type PricebookItem,
} from "@/lib/crm/pricebook-model";

type DocumentPricebookPickerProps = {
  documentLabel: "quote" | "invoice";
  onAddItem: (item: PricebookItem) => void;
  onAddBundle: (bundle: PricebookBundleDetail) => void;
};

export default function DocumentPricebookPicker({
  documentLabel,
  onAddItem,
  onAddBundle,
}: DocumentPricebookPickerProps) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bundleErrorMessage, setBundleErrorMessage] = useState<string | null>(null);
  const { items, bundles, isSearching, errorMessage } = usePricebookSearch(query);

  const hasResults = items.length > 0 || bundles.length > 0;
  const emptyMessage = useMemo(() => {
    if (query.trim()) {
      return "No active pricebook items or bundles match the current search.";
    }

    return `Start typing to search the pricebook for this ${documentLabel}.`;
  }, [documentLabel, query]);

  async function handleAddBundle(bundle: PricebookBundle) {
    const actionId = `bundle:${bundle.id}`;
    setBusyId(actionId);
    setBundleErrorMessage(null);

    try {
      const detail = await loadPricebookBundleDetail(bundle.id);
      onAddBundle(detail);
    } catch (error) {
      setBundleErrorMessage(error instanceof Error ? error.message : "The pricebook bundle could not be loaded.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
      <div className="flex items-center gap-2 text-white">
        <Package2 className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <h3 className="text-base font-semibold text-[#f5ecd2]">Add From Pricebook</h3>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">Search pricebook</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/34" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items or bundles"
            className="w-full rounded-[18px] border border-white/10 bg-black/35 py-3 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)]"
          />
        </div>
      </label>

      {isSearching ? (
        <div className="mt-4 inline-flex items-center gap-2 text-xs text-white/52">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          Searching pricebook
        </div>
      ) : null}

      {errorMessage || bundleErrorMessage ? (
        <div className="mt-4 rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage ?? bundleErrorMessage}
        </div>
      ) : null}

      {hasResults ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Items</p>
            <div className="mt-3 space-y-3">
              {items.map((item) => (
                <div key={item.id} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{item.name}</p>
                      <p className="mt-1 text-xs text-white/44">{item.internal_sku}</p>
                      {item.customer_description ? (
                        <p className="mt-2 text-sm text-white/58">{item.customer_description}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddItem(item)}
                      className="rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/74 transition hover:border-white/20 hover:text-white"
                    >
                      Add
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-white/44">
                    <span>{item.item_type}</span>
                    <span>{formatCurrencyFromCents(item.customer_price_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Bundles</p>
            <div className="mt-3 space-y-3">
              {bundles.map((bundle) => {
                const actionId = `bundle:${bundle.id}`;

                return (
                  <div key={bundle.id} className="rounded-[18px] border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-white">{bundle.name}</p>
                        {bundle.description ? (
                          <p className="mt-2 text-sm text-white/58">{bundle.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void handleAddBundle(bundle);
                        }}
                        disabled={busyId === actionId}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-white/74 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyId === actionId ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-[18px] border border-white/10 bg-black/20 px-4 py-5 text-sm text-white/50">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-[color:var(--flat-gold)]" />
            <span>{emptyMessage}</span>
          </div>
        </div>
      )}
    </section>
  );
}
