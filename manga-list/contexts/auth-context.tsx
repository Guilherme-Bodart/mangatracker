"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { setCsrfToken } from "@/lib/csrf";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";
import { useRouter } from "@/i18n/routing";
import { logger } from "@/lib/logger";

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

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = React.useCallback(async (): Promise<User | null> => {
    try {
      const data = await apiRequest<{ user: User; csrfToken?: string }>(
        "/auth/me",
      );
      setUser(data.user);
      return data.user;
    } catch (error) {
      logger.error("Failed to fetch user", error);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      await refreshUser();
      setIsLoading(false);
    };
    load();
  }, [refreshUser]);

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
