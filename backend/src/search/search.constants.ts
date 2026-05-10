export const SEARCH_LIMITS = {
  minQueryLength: 2,
  maxQueryLength: 120,
  jobsCandidateLimit: 50,
  customersCandidateLimit: 50,
  jobsResultLimit: 10,
  customersResultLimit: 10,
  perEntityTimeoutMs: 350,
  totalTimeoutMs: 700,
} as const;

export const SEARCH_ERROR_CODES = {
  invalidQuery: "invalid_query",
  forbidden: "forbidden",
  timeout: "search_timeout",
  jobsTimeout: "jobs_timeout",
  customersTimeout: "customers_timeout",
  jobsError: "jobs_search_error",
  customersError: "customers_search_error",
} as const;
