export type PhoenixInvoicePaymentStatus = "unpaid" | "paid";

export type PhoenixInvoice = {
  id: string;
  job_id: string;
  amount: number;
  payment_status: PhoenixInvoicePaymentStatus;
  created_at: string;
  updated_at: string;
};

export type PhoenixInvoiceInsert = {
  job_id: string;
  amount: number;
  payment_status?: PhoenixInvoicePaymentStatus;
};

export type PhoenixInvoiceUpdate = Partial<PhoenixInvoiceInsert>;