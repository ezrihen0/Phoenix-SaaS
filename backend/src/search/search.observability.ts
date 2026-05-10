import { Injectable, Logger } from "@nestjs/common";

import type { SearchEntityTiming, SearchMetaError } from "./search.types";

type SearchLogPayload = {
  requestId: string;
  queryLength: number;
  tookMs: number;
  partial: boolean;
  entityTiming: SearchEntityTiming[];
  errors: SearchMetaError[];
};

@Injectable()
export class SearchObservability {
  private readonly logger = new Logger("GlobalSearch");

  logRequest(payload: SearchLogPayload) {
    this.logger.log(JSON.stringify(payload));
  }
}
