import { Injectable, Logger } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { apiError } from "../common/api-response";
import {
  ALBERTA_V1_KNOWLEDGE_FILES,
  FIELD_KNOWLEDGE_ALLOWLISTED_PATHS,
  FIELD_KNOWLEDGE_APPROVED_DOMAINS,
  FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE,
  FIELD_KNOWLEDGE_MAX_PROMPT_BYTES,
  FIELD_KNOWLEDGE_MAX_TOPIC_BYTES,
  GAS_FIREPLACE_TOPIC_FILES,
  type AlbertaV1KnowledgeKey,
  type FieldKnowledgeDomain,
  type FieldKnowledgeSelectionKey,
  type GasFireplaceTopicKey,
} from "./field-knowledge/field-knowledge.constants";
import { selectAlbertaV1KnowledgePacks } from "./field-knowledge/field-knowledge-jurisdiction-selector";
import {
  detectFieldKnowledgeTopics,
  type FieldKnowledgeTopicSelection,
} from "./field-knowledge/field-knowledge-topic-detector";
import { assertRuntimeKnowledgePathAllowed } from "./field-knowledge/field-knowledge-path-guard";
import type { FieldKnowledgeRuntimeContext } from "./field-knowledge/field-knowledge-runtime.types";

export type FieldKnowledgeLoadContext = {
  serviceCity?: string | null;
  /** When set, only these pack/topic keys may be loaded (runtime safety wrapper). */
  allowedPackKeys?: ReadonlySet<FieldKnowledgeSelectionKey>;
  runtimeContext?: FieldKnowledgeRuntimeContext;
};

export type FieldKnowledgeExcerpt = {
  domain: FieldKnowledgeDomain;
  selectionKey: FieldKnowledgeSelectionKey;
  relativePath: string;
  excerpt: string;
};

export type FieldKnowledgeBundle = {
  selection: FieldKnowledgeTopicSelection;
  jurisdictionPacks: AlbertaV1KnowledgeKey[];
  jurisdictionNotice: string | null;
  excerpts: FieldKnowledgeExcerpt[];
  totalBytes: number;
  /** Legacy topics + Alberta pack keys loaded or selected for telemetry. */
  keysUsed: FieldKnowledgeSelectionKey[];
};

@Injectable()
export class AiFieldKnowledgeService {
  private readonly logger = new Logger(AiFieldKnowledgeService.name);
  private readonly knowledgeRoot: string;

  constructor() {
    this.knowledgeRoot = join(__dirname, "..", "..", "..", "docs", "field-knowledge");
  }

  assertApprovedDomain(domain: string | undefined): FieldKnowledgeDomain {
    const normalized = (domain ?? FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE).trim();
    if (!(FIELD_KNOWLEDGE_APPROVED_DOMAINS as readonly string[]).includes(normalized)) {
      apiError(400, "field_knowledge_domain_invalid", "Unsupported field knowledge domain.");
    }
    return normalized as FieldKnowledgeDomain;
  }

  selectTopics(domain: FieldKnowledgeDomain, userMessage: string): FieldKnowledgeTopicSelection {
    return detectFieldKnowledgeTopics(domain, userMessage);
  }

  async loadKnowledgeBundle(
    domain: FieldKnowledgeDomain,
    userMessage: string,
    context: FieldKnowledgeLoadContext = {},
  ): Promise<FieldKnowledgeBundle> {
    const selection = this.selectTopics(domain, userMessage);
    const jurisdiction = selectAlbertaV1KnowledgePacks({
      domain,
      userMessage,
      serviceCity: context.serviceCity,
    });

    const excerpts: FieldKnowledgeExcerpt[] = [];
    const keysUsed: FieldKnowledgeSelectionKey[] = [];
    let totalBytes = 0;

    const tryAppend = async (selectionKey: FieldKnowledgeSelectionKey, relativePath: string) => {
      if (context.allowedPackKeys && !context.allowedPackKeys.has(selectionKey)) {
        return true;
      }

      const raw = await this.readAllowlistedFile(relativePath);
      const excerpt = this.truncateUtf8(raw, FIELD_KNOWLEDGE_MAX_TOPIC_BYTES);
      const excerptBytes = Buffer.byteLength(excerpt, "utf8");

      if (totalBytes + excerptBytes > FIELD_KNOWLEDGE_MAX_PROMPT_BYTES) {
        this.logger.warn(`field_knowledge_prompt_cap_reached domain=${domain} key=${selectionKey}`);
        return false;
      }

      excerpts.push({ domain, selectionKey, relativePath, excerpt });
      keysUsed.push(selectionKey);
      totalBytes += excerptBytes;
      return true;
    };

    for (const packKey of jurisdiction.jurisdictionPacks) {
      const relativePath = ALBERTA_V1_KNOWLEDGE_FILES[packKey];
      const continued = await tryAppend(packKey, relativePath);
      if (!continued) {
        break;
      }
    }

    for (const topic of selection.topics) {
      const relativePath = this.resolveLegacyTopicPath(domain, topic);
      const continued = await tryAppend(topic, relativePath);
      if (!continued) {
        break;
      }
    }

    return {
      selection,
      jurisdictionPacks: jurisdiction.jurisdictionPacks,
      jurisdictionNotice: jurisdiction.jurisdictionNotice,
      excerpts,
      keysUsed,
      totalBytes,
    };
  }

  formatBundleForPrompt(bundle: FieldKnowledgeBundle): string {
    const parts: string[] = [];

    if (bundle.jurisdictionNotice) {
      parts.push(
        `### JURISDICTION_NOTICE\n\n${bundle.jurisdictionNotice}\n\n(Do not invent permits, codes, or clearances for this location.)`,
      );
    }

    if (bundle.excerpts.length === 0 && parts.length === 0) {
      return "FIELD_KNOWLEDGE: (no excerpts loaded)";
    }

    if (bundle.excerpts.length > 0) {
      const blocks = bundle.excerpts.map(
        (item) => `### ${item.domain} / ${item.selectionKey}\nSource: ${item.relativePath}\n\n${item.excerpt}`,
      );
      parts.push(...blocks);
    }

    return `FIELD_KNOWLEDGE (approved trade packs only — not customer data):\n\n${parts.join("\n\n---\n\n")}`;
  }

  private resolveLegacyTopicPath(domain: FieldKnowledgeDomain, topic: GasFireplaceTopicKey): string {
    if (domain !== FIELD_KNOWLEDGE_DOMAIN_GAS_FIREPLACE) {
      apiError(400, "field_knowledge_domain_invalid", "Unsupported field knowledge domain.");
    }

    const relativePath = GAS_FIREPLACE_TOPIC_FILES[topic];
    if (!relativePath) {
      apiError(400, "field_knowledge_topic_invalid", "Unsupported field knowledge topic.");
    }

    return relativePath;
  }

  private async readAllowlistedFile(relativePath: string): Promise<string> {
    const normalized = relativePath.replace(/\\/g, "/");
    if (normalized.includes("..") || normalized.startsWith("/")) {
      apiError(400, "field_knowledge_path_forbidden", "Invalid knowledge path.");
    }

    const pathGuard = assertRuntimeKnowledgePathAllowed(normalized);
    if (!pathGuard.ok) {
      apiError(400, "field_knowledge_path_forbidden", "Knowledge path is not permitted at runtime.");
    }

    if (!FIELD_KNOWLEDGE_ALLOWLISTED_PATHS.includes(normalized)) {
      apiError(400, "field_knowledge_path_forbidden", "Knowledge path is not on the allowlist.");
    }

    const absolutePath = join(this.knowledgeRoot, normalized);

    try {
      return await readFile(absolutePath, "utf8");
    } catch (error) {
      this.logger.error(
        `field_knowledge_read_failed path=${normalized}: ${error instanceof Error ? error.message : String(error)}`,
      );
      apiError(500, "field_knowledge_load_failed", "Approved field knowledge could not be loaded.");
    }
  }

  private truncateUtf8(text: string, maxBytes: number): string {
    const buffer = Buffer.from(text, "utf8");
    if (buffer.length <= maxBytes) {
      return text;
    }
    return buffer.subarray(0, maxBytes).toString("utf8").trimEnd() + "\n\n[excerpt truncated]";
  }
}

