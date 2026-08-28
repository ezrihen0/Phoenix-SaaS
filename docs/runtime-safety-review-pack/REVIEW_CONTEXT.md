# Verification context (isolated runs)

## Staged scope (13 files)

Runtime safety foundation only — see `staged-files-name-only.txt`.

No manifest, approved pack markdown, frontend, or `.cursor` in the index.

## Isolation test results

### A. Staged runtime + HEAD field-knowledge + no untracked ai-chat

| Command | Result |
|---------|--------|
| `npm run build --workspace backend` | **FAIL** — missing `FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS`; doors pack keys; missing ai-chat/actions modules |
| `field-knowledge:contract-check` | **FAIL** — staged contract-check requires doors-windows in constants/topic-detector/copilot |
| `field-knowledge:unit-check` | **PASS** (gas-only HEAD behavior) |
| `field-knowledge:runtime-safety-check` | **FAIL** — pack-gates keys not in HEAD `FieldKnowledgeSelectionKey` |

### B. Staged runtime + unstaged FK doors backend + no ai-chat

| Command | Result |
|---------|--------|
| `field-knowledge:contract-check` | **ok** |
| `field-knowledge:runtime-safety-check` | **ok** |
| `npm run build` | **FAIL** — ai-chat/actions only (already imported on committed `ai.controller` / `ai.module`) |

## Verdict

| Question | Answer |
|----------|--------|
| Standalone runtime-safety commit safe? | **No** |
| Depends on prior branch work? | **Yes** |
| AI Voice live booking implemented? | **No** — shell surface + fallbacks + `booking_eligibility` flags only |

## Required commit order

1. **AI chat / actions** — untracked modules referenced by committed Nest wiring.
2. **Field-knowledge backend (doors-windows)** — `field-knowledge.constants.ts`, `field-knowledge-jurisdiction-selector.ts`, `field-knowledge-topic-detector.ts`, `field-knowledge-unit-check.ts` (unstaged today).
3. **Runtime safety** — current staged 13-file set.

Manifest / `docs/field-knowledge/trades/doors-windows/**` are **not** required for compile or runtime-safety unit checks; can follow as a separate docs commit.

## Staged → unstaged coupling

Staged files import or assert:

- `FIELD_KNOWLEDGE_DOMAIN_DOORS_WINDOWS` and `ca_ab_doors_windows_*` pack keys (`constants`, `pack-gates`, `runtime.constants`, `contract-check`, `ai-field-copilot.service.ts`).
- Topic-detector / jurisdiction doors branches (`contract-check` reads source; gate engine calls HEAD modules at runtime).
