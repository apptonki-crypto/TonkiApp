"use client";

import { PollarProvider, usePollar } from "@pollar/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readPollarNetwork,
  readPollarPublishableKey,
} from "src/lib/auth/pollarPublicConfig";

type PollarActions = {
  logout: () => void;
};

const PollarActionsContext = createContext<PollarActions>({
  logout: () => {},
});

const PollarReadyContext = createContext(false);

function PollarActionsBridge({ children }: { children: ReactNode }) {
  const { logout } = usePollar();
  const value = useMemo(() => ({ logout }), [logout]);
  return (
    <PollarActionsContext.Provider value={value}>
      <PollarReadyContext.Provider value={true}>
        {children}
      </PollarReadyContext.Provider>
    </PollarActionsContext.Provider>
  );
}

export function usePollarLogout(): () => void {
  return useContext(PollarActionsContext).logout;
}

export function usePollarReady(): boolean {
  return useContext(PollarReadyContext);
}

export function PollarAppProvider({ children }: { children: ReactNode }) {
  const apiKey = readPollarPublishableKey();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!apiKey || !mounted) {
    return (
      <PollarReadyContext.Provider value={false}>
        {children}
      </PollarReadyContext.Provider>
    );
  }

  return (
    <PollarProvider
      client={{ apiKey, stellarNetwork: readPollarNetwork() }}
    >
      <PollarActionsBridge>{children}</PollarActionsBridge>
    </PollarProvider>
  );
}
