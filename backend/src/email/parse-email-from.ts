export type ParsedEmailFrom = {
  address: string;
  name?: string;
};

/** Parse `Display Name <addr@domain>` or bare address from SMTP_FROM-style values. */
export function parseEmailFrom(raw: string): ParsedEmailFrom | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const bracketMatch = trimmed.match(/^(.+?)\s*<([^>]+)>$/);
  if (bracketMatch) {
    const name = bracketMatch[1]?.trim().replace(/^["']|["']$/g, "");
    const address = bracketMatch[2]?.trim();
    if (address) {
      return name ? { address, name } : { address };
    }
  }

  if (trimmed.includes("@")) {
    return { address: trimmed };
  }

  return null;
}
