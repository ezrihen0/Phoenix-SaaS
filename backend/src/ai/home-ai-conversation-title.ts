export const HOME_AI_DEFAULT_CONVERSATION_TITLE = "New conversation";
export const HOME_AI_TITLE_MAX_LENGTH = 48;

const PREFIX_PATTERNS = [
  /^(hey|hi|hello|please|pls)(?:[,!\s]+|$)/i,
  /^(can you|could you|would you|will you)\s+/i,
  /^(i (?:need|want|would like)(?: you)?(?: to)?)\s+/i,
  /^(show me|tell me|give me|list|find|get|look up|look for)\s+/i,
  /^(what(?:'s| is| are| were| was)|which|who|whose|how many|how much|when|where)\s+/i,
];

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "for",
  "to",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "about",
  "into",
  "my",
  "our",
  "your",
  "me",
  "us",
  "we",
  "i",
  "you",
  "that",
  "do",
  "does",
  "did",
  "are",
  "is",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "who",
  "whom",
  "which",
  "what",
  "any",
  "all",
  "some",
  "there",
]);

function toTitleCase(word: string): string {
  if (/^\d/.test(word)) {
    return word;
  }
  const lower = word.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

export function generateHomeAiConversationTitle(message: string | null | undefined): string {
  let text = (message ?? "").replace(/\s+/g, " ").trim();
  if (!text) {
    return HOME_AI_DEFAULT_CONVERSATION_TITLE;
  }

  text = text.replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();

  let stripped = text;
  for (let pass = 0; pass < 3; pass += 1) {
    let next = stripped;
    for (const pattern of PREFIX_PATTERNS) {
      next = next.replace(pattern, "");
    }
    if (next === stripped) {
      break;
    }
    stripped = next.trim();
  }

  const tokens = stripped.split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((token) => {
    const normalized = token.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized.length > 0 && !STOP_WORDS.has(normalized);
  });
  const chosen = (meaningful.length > 0 ? meaningful : tokens).slice(0, 5);
  if (chosen.length === 0) {
    return HOME_AI_DEFAULT_CONVERSATION_TITLE;
  }

  const title = chosen.map(toTitleCase).join(" ");
  if (title.length <= HOME_AI_TITLE_MAX_LENGTH) {
    return title;
  }
  return `${title.slice(0, HOME_AI_TITLE_MAX_LENGTH - 1).trimEnd()}…`;
}
