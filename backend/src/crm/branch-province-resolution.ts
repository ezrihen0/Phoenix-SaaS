export type BranchProvinceCode = "AB" | "ON";

export function normalizeServiceProvinceToBranchCode(
  value: string | null | undefined,
): BranchProvinceCode | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "AB" || normalized === "ALBERTA") {
    return "AB";
  }

  if (normalized === "ON" || normalized === "ONTARIO") {
    return "ON";
  }

  return null;
}

export function describeBranchProvinceCode(code: BranchProvinceCode): string {
  return code === "AB" ? "Alberta" : "Ontario";
}
