import Link from "next/link";

import type { HomeAiRecordLink } from "@/lib/ai/home-ai-types";

function hrefForRecord(link: HomeAiRecordLink): string | null {
  switch (link.type) {
    case "customer":
      return `/customers/${link.id}`;
    case "lead":
      return `/leads?leadId=${encodeURIComponent(link.id)}`;
    case "job":
      return `/jobs/${link.id}`;
    case "estimate":
      return `/estimates/${link.id}`;
    case "invoice":
      return `/invoices/${link.id}`;
    case "schedule":
      return "/schedule";
    default:
      return null;
  }
}

export function HomeRecordLinks({ links }: { links: HomeAiRecordLink[] }) {
  const visible = links.filter((link) => hrefForRecord(link));

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {visible.map((link) => {
        const href = hrefForRecord(link)!;
        return (
          <Link
            key={`${link.type}-${link.id}`}
            href={href}
            className="theme-btn-secondary inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
