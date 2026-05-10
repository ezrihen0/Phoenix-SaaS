"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Package2, Search, Wrench } from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  buildPricebookBundleQuery,
  buildPricebookItemQuery,
  formatCurrencyFromCents,
  type PricebookBundle,
  type PricebookBundleDetail,
  type PricebookBundleListResult,
  type PricebookItem,
  type PricebookItemListResult,
} from "@/lib/crm/pricebook-model";

type QuotePricebookPickerProps = {
  onAddItem: (item: PricebookItem) => void;
  onAddBundle: (bundle: PricebookBundleDetail) => void;
};

export default function QuotePricebookPicker({
  onAddItem,
  onAddBundle,
}: QuotePricebookPickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PricebookItem[]>([]);
  const [bundles, setBundles] = useState<PricebookBundle[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasResults = items.length > 0 || bundles.length > 0;

  async function handleSearch() {
    setErrorMessage(null);
    setIsSearching(true);

    try {
      const itemParams = buildPricebookItemQuery({
        q: query,
        activeState: "active",
        pageSize: 8,
      });
      const bundleParams = buildPricebookBundleQuery({
        q: query,
        activeState: "active",
        pageSize: 6,
      });

      const [itemResult, bundleResult] = await Promise.all([
        crmApiFetch<PricebookItemListResult>(`/api/pricebook/items?${itemParams.toString()}`),
        crmApiFetch<PricebookBundleListResult>(`/api/pricebook/bundles?${bundleParams.toString()}`),
      ]);

      setItems(itemResult.items);
      setBundles(bundleResult.items);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Pricebook search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleAddBundle(bundle: PricebookBundle) {
    setErrorMessage(null);
    setBusyId(`bundle:${bundle.id}`);

    try {
      const bundleDetail = await crmApiFetch<PricebookBundleDetail>(`/api/pricebook/bundles/${bundle.id}`);
      onAddBundle(bundleDetail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "The pricebook bundle could not be loaded.");
    } finally {
      setBusyId(null);
    }
  }

  const emptyMessage = useMemo(() => {
    if (query.trim()) {
      return "No active pricebook items or bundles match the current search.";
    }

    return "Search the pricebook to add items or bundles to this quote.";
  }, [query]);

  return (
    <section className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
      <div className="flex items-center gap-2 text-white">
        <Package2 className="h-4 w-4 text-[color:var(--flat-gold)]" />
        <h3 className="text-base font-semibold text-[#f5ecd2]">Add From Pricebook</h3>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Search pricebook</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items or bundles"
            className="w-full rounded-[18px] border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/24 focus:border-[color:rgba(212,175,55,0.34)]"
          />
        </label>
        <button
          type="button"
          onClick={() => {
            void handleSearch();
          }}
          disabled={isSearching}
          className="inline-flex items-center justify-center gap-2 rounded-[18px] border border-[color:rgba(212,175,55,0.24)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm font-medium text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-[18px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {errorMessage}
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
