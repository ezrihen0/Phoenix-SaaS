import type { Database } from "@/lib/types/database";

export type PhoenixLeadSource = Database["public"]["Enums"]["lead_source"];
export type PhoenixLeadServiceType = Database["public"]["Enums"]["service_type"];
export type PhoenixLeadStatus = Database["public"]["Enums"]["lead_status"];

export type PhoenixLead = {
  id: string;
  full_name: string;
  phone: string;
  address: string;
  source: PhoenixLeadSource;
  service_type: PhoenixLeadServiceType;
  status: PhoenixLeadStatus;
  created_at: string;
  updated_at: string;
};

export type PhoenixLeadInsert = {
  full_name: string;
  phone: string;
  address: string;
  source?: PhoenixLeadSource;
  service_type: PhoenixLeadServiceType;
  status?: PhoenixLeadStatus;
};

export type PhoenixLeadUpdate = Partial<PhoenixLeadInsert>;