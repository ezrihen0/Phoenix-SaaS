import type { Database } from "@/lib/types/database";

export type PhoenixJobType = Database["public"]["Enums"]["service_type"];
export type PhoenixJobStatus = Database["public"]["Enums"]["job_status"];

export type PhoenixJob = {
  id: string;
  lead_id: string | null;
  technician_id: string | null;
  job_type: PhoenixJobType;
  job_status: PhoenixJobStatus;
  scheduled_date: string | null;
  scheduled_time: string | null;
  created_at: string;
  updated_at: string;
};

export type PhoenixJobInsert = {
  lead_id?: string | null;
  technician_id?: string | null;
  job_type: PhoenixJobType;
  job_status?: PhoenixJobStatus;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
};

export type PhoenixJobUpdate = Partial<PhoenixJobInsert>;