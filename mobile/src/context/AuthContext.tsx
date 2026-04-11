import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getApiBase } from "../api";
import { STORAGE } from "../storageKeys";

type AuthState = {
  userId: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = await AsyncStorage.getItem(STORAGE.userId);
        setUserId(uid);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const base = getApiBase();
    const res = await fetch(`${base}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `Login failed (${res.status})`);
    }
    const data = (await res.json()) as { user_id: string; access_token: string };
    await AsyncStorage.setItem(STORAGE.userId, data.user_id);
    await AsyncStorage.setItem(STORAGE.token, data.access_token);
    setUserId(data.user_id);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([STORAGE.userId, STORAGE.token]);
    setUserId(null);
  }, []);

  const value = useMemo(
    () => ({ userId, ready, login, logout }),
    [userId, ready, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
