import { Injectable } from "@nestjs/common";

import { AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES } from "./ai.constants";

@Injectable()
export class AiContextBuilderService {
  summarizeToolOutput(toolOutput: unknown): { json: string; byteLength: number } {
    const json = JSON.stringify(toolOutput);

    const byteLength = Buffer.byteLength(json, "utf8");
    return { json, byteLength };
  }

  enforceOutputCap(byteLength: number) {
    if (byteLength > AI_MAX_SERIALIZED_TOOL_OUTPUT_BYTES) {
      return false;
    }
    return true;
  }
}
