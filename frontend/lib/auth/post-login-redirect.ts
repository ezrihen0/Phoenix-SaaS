export function isSafeInternalAppPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("..");
}

export function resolvePostLoginPath(nextPath: string | null, destination: string | null) {
  if (nextPath && isSafeInternalAppPath(nextPath)) {
    return nextPath;
  }

  return destination ?? "/home";
}
