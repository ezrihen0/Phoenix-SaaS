"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";

const LG_QUERY = "(min-width: 1024px)";

function useMediaQuery(query: string, defaultMatches = false) {
  const [matches, setMatches] = useState(defaultMatches);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const mediaQuery = window.matchMedia(query);

    function sync() {
      setMatches(mediaQuery.matches);
      setReady(true);
    }

    sync();
    mediaQuery.addEventListener("change", sync);

    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, [query]);

  return { matches, ready };
}

/** Renders children only below the lg breakpoint (after mount — avoids duplicate SSR trees). */
export function ShowBelowLg({ children }: { children: ReactNode }) {
  const { matches, ready } = useMediaQuery(LG_QUERY);

  if (!ready) {
    return null;
  }

  if (matches) {
    return null;
  }

  return <>{children}</>;
}

/** Renders children only at lg breakpoint and above (after mount). */
export function ShowAboveLg({ children }: { children: ReactNode }) {
  const { matches, ready } = useMediaQuery(LG_QUERY);

  if (!ready) {
    return null;
  }

  if (!matches) {
    return null;
  }

  return <>{children}</>;
}
