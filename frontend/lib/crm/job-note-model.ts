export type PhoenixJobNote = {
  id: number;
  job_id: string;
  findings: string | null;
  recommendations: string | null;
  created_at: string;
  updated_at: string;
};

export type PhoenixJobNoteInsert = {
  job_id: string;
  findings?: string | null;
  recommendations?: string | null;
};

export type PhoenixJobNoteUpdate = Partial<PhoenixJobNoteInsert>;