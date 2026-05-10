import { CalendarDays, ExternalLink, MapPin, Phone, UserRound } from "lucide-react";

import type { DispatchStop } from "@/lib/crm/dispatch";

export default function DispatchStopCard({
  stop,
  isSelected,
  onSelect,
}: {
  stop: DispatchStop;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`rounded-[24px] border p-4 transition ${isSelected ? "border-[color:rgba(212,175,55,0.28)] bg-[color:rgba(212,175,55,0.08)]" : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-white">{stop.title}</p>
          <p className="mt-1 text-sm text-white/52">{stop.customerLabel}</p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-white/56">
          {stop.statusLabel}
        </span>
      </div>

      <div className="mt-4 space-y-2 text-sm text-white/64">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 text-[color:var(--flat-gold)]" />
          <span className="leading-6 text-white">{stop.addressLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[color:var(--flat-gold)]" />
          <span>{stop.scheduledTimeLabel}{stop.scheduledWindow ? ` • ${stop.scheduledWindow}` : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-[color:var(--flat-gold)]" />
          <span>{stop.technicianLabel}</span>
        </div>
        {stop.customerPhone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-[color:var(--flat-gold)]" />
            <a href={`tel:${stop.customerPhone}`} className="transition hover:text-white">
              {stop.customerPhone}
            </a>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSelect}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:border-white/24 hover:text-white"
        >
          Open details
        </button>
        <a
          href={stop.googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(212,175,55,0.22)] px-4 py-2 text-sm text-[color:var(--flat-gold)] transition hover:border-[color:rgba(212,175,55,0.34)] hover:bg-[color:rgba(212,175,55,0.08)]"
        >
          <ExternalLink className="h-4 w-4" />
          Open in Google Maps
        </a>
      </div>
    </article>
  );
}