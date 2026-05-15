import { Injectable } from "@nestjs/common";

import type { AiModelInvoker } from "./ai-model-invoker";

@Injectable()
export class AiPhase0NoopModelInvoker implements AiModelInvoker {
  readonly descriptor = "phase0_noop";

  async invoke(): Promise<{ skipped: true; reasonCode: string }> {
    return { skipped: true, reasonCode: "phase0_no_external_model" };
  }
}
