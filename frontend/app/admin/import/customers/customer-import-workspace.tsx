"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  ShieldCheck,
  Upload,
} from "lucide-react";

import { crmApiFetch } from "@/lib/crm/browser-api";
import {
  customerImportAdditionalFieldOrder,
  customerImportFieldLabels,
  customerImportFieldOrder,
  customerImportMainFieldOrder,
  customerImportRequiredFields,
  customerImportSourceOptions,
  type CustomerImportField,
  type CustomerImportPreviewResponse,
  type CustomerImportResult,
  type CustomerImportRowInput,
} from "@/lib/crm/customer-import";
import { getLeadSourceLabel } from "@/lib/crm/statuses";

type CsvRow = Record<string, string>;
type FieldMapping = Record<CustomerImportField, string>;

const fieldHeaderAliases: Record<CustomerImportField, string[]> = {
  external_client_number: ["client #", "client#", "client number", "client no", "client id"],
  full_name: ["full_name", "full name", "name", "customer name", "customer"],
  email: ["email", "email address", "e_mail"],
  company_name: ["company", "company name", "business", "business name"],
  service_address_line_1: ["service_address_line_1", "address", "street", "street address", "customer address"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone"],
  legacy_created_at: ["legacy_created_at", "created", "created at", "customer created", "date created"],
  notes: ["notes", "note", "customer notes", "internal notes", "comments", "description"],
  source: ["source", "lead source", "channel"],
};

function normalizeHeaderName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentValue = "";
  let currentRow: string[] = [];
  let isInsideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (isInsideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        isInsideQuotes = !isInsideQuotes;
      }

      continue;
    }

    if (character === "," && !isInsideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !isInsideQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell.trim().length > 0));

  if (nonEmptyRows.length < 2) {
    throw new Error("The CSV file must include a header row and at least one data row.");
  }

  const headers = nonEmptyRows[0].map((header) => header.trim());

  if (headers.some((header) => header.length === 0)) {
    throw new Error("Each CSV column needs a header label.");
  }

  const csvRows = nonEmptyRows.slice(1).map((row) => {
    const normalizedRow: CsvRow = {};

    headers.forEach((header, columnIndex) => {
      normalizedRow[header] = (row[columnIndex] ?? "").trim();
    });

    return normalizedRow;
  });

  return {
    headers,
    rows: csvRows,
  };
}

function createSuggestedMapping(headers: string[]): FieldMapping {
  const normalizedHeaderMap = new Map(headers.map((header) => [normalizeHeaderName(header), header]));

  return customerImportFieldOrder.reduce<FieldMapping>((mapping, field) => {
    const matchedHeader = fieldHeaderAliases[field]
      .map((alias) => normalizedHeaderMap.get(normalizeHeaderName(alias)))
      .find(Boolean);

    mapping[field] = matchedHeader ?? "";
    return mapping;
  }, {
    external_client_number: "",
    full_name: "",
    email: "",
    company_name: "",
    service_address_line_1: "",
    phone: "",
    legacy_created_at: "",
    notes: "",
    source: "",
  });
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2 text-sm text-white/70">
      <span className="text-[11px] uppercase tracking-[0.26em] text-white/42">{label}</span>
      {children}
    </label>
  );
}

function FieldSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-[color:rgba(212,175,55,0.28)] focus:bg-black/30 ${props.className ?? ""}`.trim()}
    />
  );
}

function StatusBadge({ status }: { status: "ready" | "duplicate" | "invalid" }) {
  const styles = {
    ready: "border-emerald-400/20 bg-emerald-400/10 text-emerald-100",
    duplicate: "border-amber-400/20 bg-amber-400/10 text-amber-100",
    invalid: "border-rose-400/20 bg-rose-400/10 text-rose-100",
  };

  const labels = {
    ready: "Ready",
    duplicate: "Duplicate",
    invalid: "Invalid",
  };

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.22em] ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function CustomerImportWorkspace({
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>(() => createSuggestedMapping([]));
  const [defaultSource, setDefaultSource] = useState<(typeof customerImportSourceOptions)[number]>("website");
  const [preview, setPreview] = useState<CustomerImportPreviewResponse | null>(null);
  const [importResult, setImportResult] = useState<CustomerImportResult | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const mappedRows = useMemo<CustomerImportRowInput[]>(() => {
    return rows.map((row, index) => {
      const getMappedValue = (field: CustomerImportField) => {
        const mappedHeader = mapping[field];

        if (mappedHeader) {
          return row[mappedHeader] || null;
        }

        if (field === "source") {
          return defaultSource;
        }

        return null;
      };

      return {
        rowNumber: index + 2,
        external_client_number: getMappedValue("external_client_number"),
        full_name: getMappedValue("full_name"),
        email: getMappedValue("email"),
        company_name: getMappedValue("company_name"),
        service_address_line_1: getMappedValue("service_address_line_1"),
        phone: getMappedValue("phone"),
        legacy_created_at: getMappedValue("legacy_created_at"),
        notes: getMappedValue("notes"),
        source: getMappedValue("source"),
      };
    });
  }, [defaultSource, mapping, rows]);

  const missingRequiredMappings = customerImportRequiredFields.filter((field) => !mapping[field]);

  function resetPreviewState() {
    setPreview(null);
    setImportResult(null);
    setConfirmImport(false);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    try {
      const csvText = await selectedFile.text();
      const parsedCsv = parseCsv(csvText);
      setFileName(selectedFile.name);
      setHeaders(parsedCsv.headers);
      setRows(parsedCsv.rows);
      setMapping(createSuggestedMapping(parsedCsv.headers));
      setErrorMessage(null);
      resetPreviewState();
    } catch (error) {
      setFileName(null);
      setHeaders([]);
      setRows([]);
      setMapping(createSuggestedMapping([]));
      setErrorMessage(error instanceof Error ? error.message : "The CSV file could not be parsed.");
      resetPreviewState();
    }
  }

  function updateMapping(field: CustomerImportField, value: string) {
    setMapping((currentMapping) => ({
      ...currentMapping,
      [field]: value,
    }));
    setErrorMessage(null);
    resetPreviewState();
  }

  function handlePreview() {
    if (rows.length === 0) {
      setErrorMessage("Upload a CSV file before previewing customers.");
      return;
    }

    if (missingRequiredMappings.length > 0) {
      setErrorMessage("Map all required customer fields before previewing the import.");
      return;
    }

    setErrorMessage(null);
    setImportResult(null);
    setConfirmImport(false);

    startTransition(() => {
      void (async () => {
        try {
          const previewResponse = await crmApiFetch<CustomerImportPreviewResponse>("/api/admin/customers/import", {
            method: "POST",
            body: JSON.stringify({
              mode: "preview",
              confirmImport: false,
              rows: mappedRows,
            }),
          });

          setPreview(previewResponse);
        } catch (error) {
          setPreview(null);
          setErrorMessage(error instanceof Error ? error.message : "The import preview could not be generated.");
        }
      })();
    });
  }

  function handleImport() {
    if (!preview) {
      setErrorMessage("Preview the customer rows before starting the import.");
      return;
    }

    if (!confirmImport) {
      setErrorMessage("Confirm the import before writing customer rows to the CRM.");
      return;
    }

    setErrorMessage(null);

    startTransition(() => {
      void (async () => {
        try {
          const result = await crmApiFetch<CustomerImportResult>("/api/admin/customers/import", {
            method: "POST",
            body: JSON.stringify({
              mode: "import",
              confirmImport: true,
              rows: mappedRows,
            }),
          });

          setImportResult(result);
          setPreview({
            summary: result.summary,
            rows: result.rows,
          });
        } catch (error) {
          setImportResult(null);
          setErrorMessage(error instanceof Error ? error.message : "The customer import could not be completed.");
        }
      })();
    });
  }

  return (
    <main className="min-h-screen bg-[color:var(--flat-canvas)] text-white">
      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <section className="rounded-[36px] border border-[color:rgba(212,175,55,0.18)] bg-[linear-gradient(180deg,rgba(11,11,11,0.96),rgba(18,18,18,0.92))] p-7 shadow-[0_36px_120px_rgba(0,0,0,0.4)] backdrop-blur-2xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.36em] text-[color:var(--flat-gold)]">Admin Import</p>
              <h1 className="mt-4 max-w-3xl font-[family:var(--font-flat-display)] text-4xl tracking-tight text-[#f5ecd2] sm:text-5xl">
                Import customer records from a CSV before they enter the jobs board.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-base">
                Upload a CSV, map the columns into the customer table, preview validation and duplicate checks, then confirm the import. Only rows marked Ready will be written to the CRM.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/customers"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:text-white"
              >
                Back to customers
              </Link>
              <Link
                href="/jobs"
                className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/72 transition hover:border-white/24 hover:text-white"
              >
                Back to jobs
              </Link>
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">CSV Rows</p>
              <p className="mt-3 text-3xl font-semibold text-[#f5ecd2]">{rows.length}</p>
            </article>
            <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Preview Ready</p>
              <p className="mt-3 text-3xl font-semibold text-[#f5ecd2]">{preview?.summary.readyRows ?? 0}</p>
            </article>
            <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Duplicates / Invalid</p>
              <p className="mt-3 text-3xl font-semibold text-[#f5ecd2]">{preview ? preview.summary.duplicateRows + preview.summary.invalidRows : 0}</p>
            </article>
          </div>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <article className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.12)] text-[color:var(--flat-gold)]">
                <Upload className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Step 1</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#f5ecd2]">Upload CSV</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Use the real Workiz customer export columns: Client #, Name, Email, Company, Address, Phone, and Created.
                </p>
              </div>
            </div>

            <label className="mt-6 flex cursor-pointer items-center gap-4 rounded-[24px] border border-dashed border-white/14 bg-black/20 px-5 py-5 transition hover:border-[color:rgba(212,175,55,0.28)] hover:bg-black/30">
              <FileSpreadsheet className="h-5 w-5 text-[color:var(--flat-gold)]" />
              <div className="flex-1">
                <p className="text-sm text-white">{fileName ?? "Choose a CSV file"}</p>
                <p className="mt-1 text-xs text-white/42">One header row plus one or more customer rows.</p>
              </div>
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            </label>

            {headers.length > 0 ? (
              <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/38">Detected Columns</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {headers.map((header) => (
                    <span
                      key={header}
                      className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:rgba(212,175,55,0.22)] bg-[color:rgba(212,175,55,0.12)] text-[color:var(--flat-gold)]">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Step 2</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#f5ecd2]">Map Columns</h2>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Review the Workiz field mapping first. Address stays in the CRM main address field and is not split into city or postal code during import.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Main Workiz Fields</p>
              <p className="mt-2 text-sm leading-6 text-white/52">
                Use the Workiz export columns directly: Client #, Name, Email, Company, Address, Phone, and Created.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {customerImportMainFieldOrder.map((field) => (
                  <FieldLabel key={field} label={customerImportFieldLabels[field]}>
                    <FieldSelect value={mapping[field]} onChange={(event) => updateMapping(field, event.target.value)}>
                      <option value="">Not mapped</option>
                      {headers.map((header) => (
                        <option key={`${field}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </FieldSelect>
                    <p className="text-xs text-white/38">
                      {customerImportRequiredFields.includes(field) ? "Required before preview" : "Optional"}
                    </p>
                  </FieldLabel>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Additional CRM Fields</p>
              <p className="mt-2 text-sm leading-6 text-white/52">
                Notes can be mapped if your CSV includes an extra note column. Lead Source defaults to Website unless you deliberately map a source column.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {customerImportAdditionalFieldOrder.map((field) => (
                  <FieldLabel key={field} label={customerImportFieldLabels[field]}>
                    <FieldSelect value={mapping[field]} onChange={(event) => updateMapping(field, event.target.value)}>
                      <option value="">{field === "source" ? "Use default" : "Not mapped"}</option>
                      {headers.map((header) => (
                        <option key={`${field}-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </FieldSelect>
                    <p className="text-xs text-white/38">
                      {field === "source" ? "Optional, defaults to Website" : "Optional"}
                    </p>
                  </FieldLabel>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-1">
              <FieldLabel label="Default Lead Source">
                <FieldSelect value={defaultSource} onChange={(event) => {
                  setDefaultSource(event.target.value as (typeof customerImportSourceOptions)[number]);
                  resetPreviewState();
                }}>
                  {customerImportSourceOptions.map((source) => (
                    <option key={source} value={source}>
                      {getLeadSourceLabel(source)}
                    </option>
                  ))}
                </FieldSelect>
              </FieldLabel>
            </div>

            {missingRequiredMappings.length > 0 ? (
              <div className="mt-5 rounded-[20px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Map the required Workiz fields before preview: {missingRequiredMappings.map((field) => customerImportFieldLabels[field]).join(", ")}
              </div>
            ) : null}

            {errorMessage ? (
              <div className="mt-5 rounded-[20px] border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {errorMessage}
              </div>
            ) : null}

            {importResult ? (
              <div className="mt-5 rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                Imported {importResult.summary.importedRows} customer row{importResult.summary.importedRows === 1 ? "" : "s"}. {importResult.summary.skippedRows} row{importResult.summary.skippedRows === 1 ? " was" : "s were"} skipped because they were duplicate or invalid.
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePreview}
                disabled={isPending || rows.length === 0}
                className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.28)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-4 py-2 text-sm text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Preview import
              </button>
            </div>
          </article>
        </section>

        {preview ? (
          <section className="mt-8 rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,18,0.94),rgba(12,12,12,0.92))] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--flat-gold)]">Step 3</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#f5ecd2]">Preview and confirm</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/58">
                  Review every row before importing. Duplicate and invalid rows will be skipped. Only rows marked Ready will be inserted into the customers table.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-white/38">Ready</p>
                  <p className="mt-2 text-2xl text-[#f5ecd2]">{preview.summary.readyRows}</p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-white/38">Duplicate</p>
                  <p className="mt-2 text-2xl text-[#f5ecd2]">{preview.summary.duplicateRows}</p>
                </div>
                <div className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/70">
                  <p className="text-[11px] uppercase tracking-[0.26em] text-white/38">Invalid</p>
                  <p className="mt-2 text-2xl text-[#f5ecd2]">{preview.summary.invalidRows}</p>
                </div>
              </div>
            </div>

            <div className="crm-table-frame mt-6">
              <div className="max-h-[640px] overflow-auto bg-black/20">
                <table className="crm-table min-w-full text-left text-sm text-white/72">
                  <thead className="bg-white/[0.04] text-[11px] uppercase tracking-[0.24em] text-white/42">
                    <tr>
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Address</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.rowNumber} className="align-top">
                        <td className="px-4 py-4 text-white/48">{row.rowNumber}</td>
                        <td className="px-4 py-4">
                          <p className="font-medium text-white">{row.fullName ?? "Missing customer name"}</p>
                          <p className="mt-1 text-xs text-white/42">
                            {[
                              row.externalClientNumber ? `Client # ${row.externalClientNumber}` : null,
                              row.companyName,
                              row.legacyCreatedAt ? `Created ${row.legacyCreatedAt}` : null,
                              getLeadSourceLabel(row.source),
                            ].filter(Boolean).join(" • ")}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <p>{row.phone ?? "Missing phone"}</p>
                          <p className="mt-1 text-xs text-white/42">{row.email ?? "No email"}</p>
                        </td>
                        <td className="px-4 py-4 text-white/58">{row.addressLabel || "Missing address"}</td>
                        <td className="px-4 py-4"><StatusBadge status={row.status} /></td>
                        <td className="px-4 py-4">
                          {row.issues.length === 0 && row.duplicateMatches.length === 0 ? (
                            <span className="inline-flex items-center gap-2 text-emerald-100">
                              <CheckCircle2 className="h-4 w-4" />
                              No issues detected
                            </span>
                          ) : (
                            <div className="space-y-3">
                              {row.issues.map((issue) => (
                                <div key={`${row.rowNumber}-${issue}`} className="flex items-start gap-2 text-rose-100">
                                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                                  <span>{issue}</span>
                                </div>
                              ))}
                              {row.duplicateMatches.map((duplicateMatch) => (
                                <div key={`${row.rowNumber}-${duplicateMatch.kind}-${duplicateMatch.reference}-${duplicateMatch.reasons.join("-")}`} className="rounded-[18px] border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                                  <p className="font-medium">{duplicateMatch.label}</p>
                                  <p className="mt-1 text-amber-50/90">Likely duplicate because of {duplicateMatch.reasons.join(", ")}.</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-white/10 bg-black/20 p-5 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex items-start gap-3 text-sm text-white/68">
                <input
                  type="checkbox"
                  checked={confirmImport}
                  onChange={(event) => setConfirmImport(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30"
                />
                <span>
                  I have reviewed the preview and want to import the ready customer rows into the CRM.
                </span>
              </label>

              <button
                type="button"
                onClick={handleImport}
                disabled={isPending || preview.summary.readyRows === 0}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.28)] bg-[linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.08))] px-5 py-3 text-sm text-[#f7df97] transition hover:bg-[linear-gradient(135deg,rgba(212,175,55,0.3),rgba(212,175,55,0.12))] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import ready rows
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}