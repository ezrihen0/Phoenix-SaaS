import { randomUUID } from "crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

import { CustomersSearchAdapter } from "./adapters/customers-search.adapter";
import { JobsSearchAdapter } from "./adapters/jobs-search.adapter";
import type { GlobalSearchResponse } from "./search.contract";
import { SEARCH_ERROR_CODES, SEARCH_LIMITS } from "./search.constants";
import { SearchNormalizer } from "./normalizers/search-normalizer";
import { SearchObservability } from "./search.observability";
import type { SearchEntityKey, SearchEntityTiming, SearchMetaError, SearchQueryContext } from "./search.types";

@Injectable()
export class SearchService {
  constructor(
    private readonly jobsSearchAdapter: JobsSearchAdapter,
    private readonly customersSearchAdapter: CustomersSearchAdapter,
    private readonly searchNormalizer: SearchNormalizer,
    private readonly observability: SearchObservability,
  ) {}

  async search(rawQuery: string | undefined): Promise<GlobalSearchResponse> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const queryContext = this.parseQuery(rawQuery);
    const entityTiming: SearchEntityTiming[] = [];
    const errors: SearchMetaError[] = [];

    const [jobsResult, customersResult] = await Promise.all([
      this.runEntitySearch(
        "jobs",
        () => this.jobsSearchAdapter.search(queryContext),
        SEARCH_ERROR_CODES.jobsError,
        SEARCH_ERROR_CODES.jobsTimeout,
        entityTiming,
        errors,
      ),
      this.runEntitySearch(
        "customers",
        () => this.customersSearchAdapter.search(queryContext),
        SEARCH_ERROR_CODES.customersError,
        SEARCH_ERROR_CODES.customersTimeout,
        entityTiming,
        errors,
      ),
    ]);

    const tookMs = Date.now() - startedAt;
    const partial = errors.length > 0 || tookMs > SEARCH_LIMITS.totalTimeoutMs;

    if (tookMs > SEARCH_LIMITS.totalTimeoutMs) {
      errors.push({
        entity: "jobs",
        code: SEARCH_ERROR_CODES.timeout,
        message: `Search exceeded total timeout of ${SEARCH_LIMITS.totalTimeoutMs}ms.`,
      });
    }

    const response: GlobalSearchResponse = {
      jobs: this.searchNormalizer.toJobResults(jobsResult),
      customers: this.searchNormalizer.toCustomerResults(customersResult),
      meta: {
        requestId,
        tookMs,
        partial,
        errors,
      },
    };

    this.observability.logRequest({
      requestId,
      queryLength: queryContext.normalized.length,
      tookMs,
      partial,
      entityTiming,
      errors,
    });

    return response;
  }

  private parseQuery(rawQuery: string | undefined): SearchQueryContext {
    const normalized = (rawQuery ?? "").trim().toLowerCase();

    if (!normalized || normalized.length < SEARCH_LIMITS.minQueryLength) {
      throw new BadRequestException({
        error: {
          code: SEARCH_ERROR_CODES.invalidQuery,
          message: `Query must be at least ${SEARCH_LIMITS.minQueryLength} characters.`,
        },
      });
    }

    const cappedQuery = normalized.slice(0, SEARCH_LIMITS.maxQueryLength);

    return {
      normalized: cappedQuery,
      likeToken: `%${cappedQuery}%`,
      digits: cappedQuery.replace(/\D+/g, ""),
    };
  }

  private async runEntitySearch<T>(
    entity: SearchEntityKey,
    worker: () => Promise<T>,
    errorCode: string,
    timeoutCode: string,
    timingStore: SearchEntityTiming[],
    errorStore: SearchMetaError[],
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      const result = await Promise.race<T>([
        worker(),
        new Promise<T>((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error("timeout"));
          }, SEARCH_LIMITS.perEntityTimeoutMs);
        }),
      ]);

      timingStore.push({
        entity,
        tookMs: Date.now() - startedAt,
        timedOut: false,
        resultCount: Array.isArray(result) ? result.length : 1,
      });

      return result;
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "timeout";
      timingStore.push({
        entity,
        tookMs: Date.now() - startedAt,
        timedOut: isTimeout,
        resultCount: 0,
      });
      errorStore.push({
        entity,
        code: isTimeout ? timeoutCode : errorCode,
        message: isTimeout
          ? `${entity} search exceeded ${SEARCH_LIMITS.perEntityTimeoutMs}ms.`
          : `${entity} search failed.`,
      });

      return [] as T;
    }
  }
}
