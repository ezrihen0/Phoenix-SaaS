import { notFound } from "next/navigation";

import { PricebookBundleEditor } from "@/components/pricebook-bundle-editor";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type { PricebookBundleDetail } from "@/lib/crm/pricebook-model";

export default async function PricebookBundleDetailPage({
  params,
}: {
  params: Promise<{ bundleId: string }>;
}) {
  const { bundleId } = await params;
  await requireServerSession(`/pricebook/bundles/${bundleId}`);

  let bundle: PricebookBundleDetail | null = null;

  try {
    bundle = await serverApiFetch<PricebookBundleDetail>(`/api/pricebook/bundles/${bundleId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";

    if (message.includes("could not be found") || message.includes("not be found")) {
      notFound();
    }

    throw error;
  }

  if (!bundle) {
    notFound();
  }

  return <PricebookBundleEditor initialBundle={bundle} />;
}