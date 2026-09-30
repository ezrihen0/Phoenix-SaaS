"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CircleDollarSign,
  FileText,
  History,
  Receipt,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { WorkspaceCollapseTabs } from "@/components/workspace-collapse-tabs";

type InvoiceCollapseSection =
  | "actions"
  | "document"
  | "lifecycle"
  | "record-payment"
  | "transactions"
  | "approval"
  | "warranty"
  | "ai";

type InvoiceDetailCollapsibleProps = {
  actionsPanel: ReactNode;
  documentPanel: ReactNode;
  lifecyclePanel: ReactNode;
  recordPaymentPanel: ReactNode;
  transactionsPanel: ReactNode;
  approvalPanel: ReactNode;
  warrantyPanel: ReactNode;
  aiPanel: ReactNode;
  paymentCount?: number;
};

export default function InvoiceDetailCollapsible({
  actionsPanel,
  documentPanel,
  lifecyclePanel,
  recordPaymentPanel,
  transactionsPanel,
  approvalPanel,
  warrantyPanel,
  aiPanel,
  paymentCount = 0,
}: InvoiceDetailCollapsibleProps) {
  const [activeSection, setActiveSection] = useState<InvoiceCollapseSection | null>(null);

  const tabs = useMemo(
    () => [
      { id: "actions" as const, label: "Actions", icon: Zap, showCount: false },
      { id: "document" as const, label: "Invoice document", icon: Receipt, showCount: false },
      { id: "lifecycle" as const, label: "Cash lifecycle", icon: CircleDollarSign, showCount: false },
      { id: "record-payment" as const, label: "Record payment", icon: CircleDollarSign, showCount: false },
      {
        id: "transactions" as const,
        label: "Payment history",
        icon: History,
        count: paymentCount,
        showCount: paymentCount > 0,
      },
      { id: "approval" as const, label: "Approval & signature", icon: FileText, showCount: false },
      { id: "warranty" as const, label: "Warranty", icon: ShieldCheck, showCount: false },
      { id: "ai" as const, label: "Collection desk", icon: Sparkles, showCount: false },
    ],
    [paymentCount],
  );

  function toggleSection(section: InvoiceCollapseSection) {
    setActiveSection((current) => (current === section ? null : section));
  }

  function renderPanel(section: InvoiceCollapseSection) {
    switch (section) {
      case "actions":
        return actionsPanel;
      case "document":
        return documentPanel;
      case "lifecycle":
        return lifecyclePanel;
      case "record-payment":
        return recordPaymentPanel;
      case "transactions":
        return transactionsPanel;
      case "approval":
        return approvalPanel;
      case "warranty":
        return warrantyPanel;
      case "ai":
        return aiPanel;
      default:
        return null;
    }
  }

  return (
    <WorkspaceCollapseTabs tabs={tabs} activeTab={activeSection} onToggle={toggleSection}>
      {(section) => renderPanel(section)}
    </WorkspaceCollapseTabs>
  );
}
