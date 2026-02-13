"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createCsrfHeaders, ensureCsrfToken } from "@/lib/csrf";
import { useRouter } from "@/i18n/routing";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  const refreshUser = React.useCallback(async (): Promise<User | null> => {
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        credentials: "include",
      });

      if (!response.ok) {
        setUser(null);
        return null;
      }

      const data = (await response.json()) as { user: User };
      setUser(data.user);
      return data.user;
    } catch (error) {
      console.error("Failed to fetch user:", error);
      setUser(null);
      return null;
    }
  }, [API_URL]);

  useEffect(() => {
    const load = async () => {
      await refreshUser();
      setIsLoading(false);
    };
    load();
  }, [refreshUser]);

  const login = React.useCallback(
    async (email: string, password: string) => {
      await ensureCsrfToken(API_URL);
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      const data = (await response.json()) as { user: User };
      setUser(data.user);
    },
    [API_URL],
  );

  const register = React.useCallback(
    async (username: string, email: string, password: string) => {
      await ensureCsrfToken(API_URL);
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: createCsrfHeaders({
          "Content-Type": "application/json",
        }),
        credentials: "include",
        body: JSON.stringify({ username, email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Registration failed");
      }

      const data = (await response.json()) as { user: User };
      setUser(data.user);
    },
    [API_URL],
  );

  const logout = React.useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: createCsrfHeaders(),
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setUser(null);
      router.replace("/auth/login");
    }
  }, [API_URL, router]);

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
