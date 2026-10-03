"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { applyTheme, readStoredTheme } from "@/components/theme-runtime";
import {
  probeClientSession,
  type ClientSession,
  type ClientSessionProbeStatus,
} from "@/lib/auth/client-auth";

import { PhoenixStartupScreen } from "./phoenix-startup-screen";

export type PhoenixBootStatus = "booting" | "ready" | "error";

type PhoenixBootContextValue = {
  status: PhoenixBootStatus;
  session: ClientSession | null;
  sessionStatus: ClientSessionProbeStatus | null;
  errorMessage: string | null;
  retry: () => void;
};

const PhoenixBootContext = createContext<PhoenixBootContextValue | null>(null);

function hideStaticBootShell() {
  const node = document.getElementById("phoenix-static-boot");
  if (node) {
    node.setAttribute("aria-hidden", "true");
    node.classList.add("phoenix-static-boot-hidden");
  }
}

function markBootComplete() {
  document.documentElement.dataset.phoenixBoot = "ready";
}

async function waitForNextPaint() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

type PhoenixBootProviderProps = {
  children: ReactNode;
};

export function PhoenixBootProvider({ children }: PhoenixBootProviderProps) {
  const [status, setStatus] = useState<PhoenixBootStatus>("booting");
  const [session, setSession] = useState<ClientSession | null>(null);
  const [sessionStatus, setSessionStatus] = useState<ClientSessionProbeStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const bootAttemptRef = useRef(0);

  const runBoot = useCallback(async () => {
    const attemptId = ++bootAttemptRef.current;
    setStatus("booting");
    setErrorMessage(null);

    applyTheme(readStoredTheme());
    hideStaticBootShell();

    const probe = await probeClientSession();

    if (attemptId !== bootAttemptRef.current) {
      return;
    }

    if (probe.status === "unavailable") {
      setSession(null);
      setSessionStatus("unavailable");
      setStatus("error");
      setErrorMessage("Phoenix CRM could not reach the sign-in service. Check your connection and try again.");
      return;
    }

    setSession(probe.session);
    setSessionStatus(probe.status);
    await waitForNextPaint();

    if (attemptId !== bootAttemptRef.current) {
      return;
    }

    markBootComplete();
    setStatus("ready");
  }, []);

  useLayoutEffect(() => {
    applyTheme(readStoredTheme());
    hideStaticBootShell();
  }, []);

  useEffect(() => {
    void runBoot();
  }, [runBoot]);

  const retry = useCallback(() => {
    void runBoot();
  }, [runBoot]);

  const contextValue = useMemo<PhoenixBootContextValue>(
    () => ({
      status,
      session,
      sessionStatus,
      errorMessage,
      retry,
    }),
    [status, session, sessionStatus, errorMessage, retry],
  );

  const showOverlay = status !== "ready";

  return (
    <PhoenixBootContext.Provider value={contextValue}>
      {children}
      {showOverlay ? (
        <PhoenixStartupScreen
          state={status === "error" ? "error" : "loading"}
          errorDetail={errorMessage}
          onRetry={status === "error" ? retry : undefined}
        />
      ) : null}
    </PhoenixBootContext.Provider>
  );
}

export function usePhoenixBoot() {
  const value = useContext(PhoenixBootContext);

  if (!value) {
    throw new Error("usePhoenixBoot must be used within PhoenixBootProvider");
  }

  return value;
}
