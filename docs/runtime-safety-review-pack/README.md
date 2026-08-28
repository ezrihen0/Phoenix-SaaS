# Runtime Safety — ChatGPT Review Pack

Small, focused bundle for reviewing **staged Field Copilot runtime safety** work and its relationship to unstaged field-knowledge / AI-chat WIP.

Generated: 2026-05-28 (do not commit this folder unless you want it in-repo).

## Included

| Artifact | Description |
|----------|-------------|
| `git-status-short.txt` | `git status --short` |
| `staged-files-name-only.txt` | `git diff --cached --name-only` |
| `staged-stat.txt` | `git diff --cached --stat` |
| `runtime-safety-staged.diff` | Full staged patch |
| `unstaged-current-worktree.diff` | Full unstaged patch (FK + manifest WIP) |
| `untracked-files.txt` | `git ls-files --others --exclude-standard` |
| `backend/**` | Working-tree copies of listed source files (see below) |
| `REVIEW_CONTEXT.md` | Isolation / dependency verdict from local verification |

### Source snapshots (working tree)

- `backend/package.json`
- `backend/src/ai/ai.controller.ts`
- `backend/src/ai/ai.module.ts`
- `backend/src/ai/ai-field-copilot.service.ts`
- `backend/src/ai/ai-field-knowledge.service.ts`
- `backend/src/ai/field-knowledge/field-knowledge.constants.ts`
- `backend/src/ai/field-knowledge/field-knowledge-jurisdiction-selector.ts`
- `backend/src/ai/field-knowledge/field-knowledge-topic-detector.ts`
- `backend/src/ai/field-knowledge/field-knowledge-unit-check.ts`
- `backend/src/ai/field-knowledge/field-knowledge-contract-check.ts`
- All eight `field-knowledge-runtime*` / path-guard / pack-gates / fallback modules

**Note:** Staged patch also touches `backend/src/ai/ai-environment.ts` (kill switches / voice flag). See `runtime-safety-staged.diff`; no separate snapshot file.

## Explicitly excluded from this pack

- `frontend/**`
- `docs/chatgpt-review-package/**`
- `.cursor/**`
- `docs/field-knowledge/_candidate-updates/**`
- `docs/field-knowledge/trades/doors-windows/**` (markdown packs)
- Untracked AI-chat/actions service bodies (listed only in `untracked-files.txt`)

## Review questions for ChatGPT

1. Is the staged runtime-safety design sound (gates, path guard, fallbacks, surface cap, voice shell-only)?
2. Should doors-windows references stay in the staged commit or move to a prerequisite FK commit?
3. Is the three-commit order correct: (1) AI-chat/actions, (2) FK backend doors-windows constants/jurisdiction/topic, (3) runtime-safety?
4. Any backward-compat issues for Field Copilot API consumers (`gate_outcome`, `used_llm`, etc.)?

## Suggested upload order

1. This `README.md` + `REVIEW_CONTEXT.md`
2. `staged-stat.txt`, `staged-files-name-only.txt`, `git-status-short.txt`
3. `runtime-safety-staged.diff`
4. `unstaged-current-worktree.diff` (if reviewing FK coupling)
5. Source files under `backend/` as needed for line-level review
