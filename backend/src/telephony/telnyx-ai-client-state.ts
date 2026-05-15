type TelnyxAiClientStateV1 = {
  v: 1;
  recent_call_id: string;
};

export function encodeTelnyxAiClientStateV1(recentCallId: string): string {
  const payload: TelnyxAiClientStateV1 = {
    v: 1,
    recent_call_id: recentCallId.trim(),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function tryDecodeTelnyxAiClientStateV1(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(trimmed, "base64").toString("utf8")) as TelnyxAiClientStateV1;
    if (json?.v === 1 && typeof json.recent_call_id === "string" && json.recent_call_id.trim()) {
      return json.recent_call_id.trim();
    }
  } catch {
    return null;
  }
  return null;
}
