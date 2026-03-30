"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { setCsrfToken } from "@/lib/csrf";
import { ApiClientError, apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { useRouter } from "@/i18n/routing";
import { logger } from "@/lib/logger";
import { usePathname } from "next/navigation";

interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  avatarUrl?: string;
  bannerUrl?: string;
  allowNsfw?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_SESSION_HINT_KEY = "mt:auth:session-hint:v1";
const SUPPORTED_LOCALES = new Set(["pt", "en"]);
const PROTECTED_ROOT_SEGMENTS = new Set(["my-track", "profile"]);

function getNormalizedPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "/";
  }

  const maybeLocale = segments[0]?.toLowerCase();
  const withoutLocale = SUPPORTED_LOCALES.has(maybeLocale)
    ? segments.slice(1)
    : segments;

  if (withoutLocale.length === 0) {
    return "/";
  }

  return `/${withoutLocale.join("/")}`;
}

function isProtectedPath(pathname: string): boolean {
  const normalized = getNormalizedPathname(pathname);
  const firstSegment = normalized.split("/").filter(Boolean)[0];
  return firstSegment ? PROTECTED_ROOT_SEGMENTS.has(firstSegment) : false;
}

function readSessionHint(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(AUTH_SESSION_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSessionHint(value: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (value) {
      window.localStorage.setItem(AUTH_SESSION_HINT_KEY, "1");
    } else {
      window.localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    }
  } catch {
    // Ignore storage failures (private mode/quota).
  }
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = React.useCallback(async (): Promise<User | null> => {
    try {
      const data = await apiRequest<{ user: User; csrfToken?: string }>(
        "/auth/me",
      );
      setUser(data.user);
      writeSessionHint(true);
      return data.user;
    } catch (error) {
      if (error instanceof ApiClientError && error.status !== 401) {
        logger.error("Failed to fetch user", error);
      }
      if (error instanceof ApiClientError && error.status === 401) {
        writeSessionHint(false);
      }
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const shouldBootstrapAuth =
        readSessionHint() || isProtectedPath(pathname || "/");

      if (shouldBootstrapAuth) {
        await refreshUser();
      } else {
        setUser(null);
      }
      setIsLoading(false);
    };
    load();
  }, [pathname, refreshUser]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      const data = await apiRequest<{ user: User; csrfToken?: string }>(
        "/auth/login",
        {
          method: "POST",
          csrf: "required",
          body: { email, password },
        },
      );
      setUser(data.user);
      writeSessionHint(true);
    },
    [],
  );

  const register = React.useCallback(
    async (username: string, email: string, password: string) => {
      const data = await apiRequest<{ user: User; csrfToken?: string }>(
        "/auth/register",
        {
          method: "POST",
          csrf: "required",
          body: { username, email, password },
        },
      );
      setUser(data.user);
      writeSessionHint(true);
    },
    [],
  );

  const logout = React.useCallback(async () => {
    try {
      await apiRequest("/auth/logout", {
        method: "POST",
        csrf: "if-present",
      });
    } catch (error) {
      logger.error("Logout request failed", getApiErrorMessage(error));
    } finally {
      setCsrfToken(null);
      setUser(null);
      writeSessionHint(false);
      router.replace("/auth/login");
    }
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        register,
        logout,
        refreshUser,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
