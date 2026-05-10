export type PhoenixTechnician = {
  id: string;
  full_name: string;
  phone: string | null;
  active: boolean;
};

export type PhoenixTechnicianInsert = {
  full_name: string;
  phone?: string | null;
  active?: boolean;
};

export type PhoenixTechnicianUpdate = Partial<PhoenixTechnicianInsert>;