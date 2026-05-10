export type SearchEntityKey = "jobs" | "customers";

export type SearchMetaError = {
  entity: SearchEntityKey;
  code: string;
  message: string;
};

export type SearchMeta = {
  requestId: string;
  tookMs: number;
  partial: boolean;
  errors: SearchMetaError[];
};

export type JobSearchHit = {
  id: string;
  title: string;
  status: string;
  customerName: string;
  addressLine1: string;
  city: string;
  stateOrRegion: string | null;
  postalCode: string;
  updatedAt: string;
};

export type CustomerSearchHit = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  companyName: string | null;
  addressLine1: string;
  city: string;
  stateOrRegion: string | null;
  postalCode: string;
  updatedAt: string;
};

export type SearchResultItem = {
  id: string;
  entity: SearchEntityKey;
  title: string;
  subtitle: string;
  status: string | null;
  destination: string;
  updatedAt: string;
};

export type SearchQueryContext = {
  normalized: string;
  likeToken: string;
  digits: string;
};

export type SearchEntityTiming = {
  entity: SearchEntityKey;
  tookMs: number;
  timedOut: boolean;
  resultCount: number;
};
