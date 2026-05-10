export type PhoenixQuoteApprovalStatus = "draft" | "pending" | "approved" | "rejected";

export type PhoenixQuote = {
  id: string;
  job_id: string;
  description: string;
  amount: number;
  approval_status: PhoenixQuoteApprovalStatus;
  created_at: string;
  updated_at: string;
};

export type PhoenixQuoteInsert = {
  job_id: string;
  description: string;
  amount: number;
  approval_status?: PhoenixQuoteApprovalStatus;
};

export type PhoenixQuoteUpdate = Partial<PhoenixQuoteInsert>;