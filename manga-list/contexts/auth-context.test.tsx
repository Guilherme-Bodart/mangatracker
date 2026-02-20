import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();

vi.mock("@/i18n/routing", () => ({
  useRouter: () => ({
    replace: replaceMock,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiRequest: vi.fn(),
  getApiErrorMessage: vi.fn((error: unknown, fallback = "Request failed") =>
    error instanceof Error ? error.message : fallback,
  ),
}));

vi.mock("@/lib/csrf", () => ({
  setCsrfToken: vi.fn(),
}));

import { apiRequest } from "@/lib/api-client";
import { setCsrfToken } from "@/lib/csrf";
import { AuthProvider, useAuth } from "@/contexts/auth-context";

type User = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
};

function AuthProbe() {
  const { user, isLoading, login, register, logout } = useAuth();

  return (
    <div>
      <span data-testid="loading">{isLoading ? "loading" : "ready"}</span>
      <span data-testid="username">{user?.username ?? "none"}</span>
      <button
        type="button"
        onClick={() => void login("user@example.com", "Password123!")}
      >
        login
      </button>
      <button
        type="button"
        onClick={() => void register("new-user", "new@example.com", "Password123!")}
      >
        register
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

function renderAuthProvider() {
  return render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );
}

describe("AuthProvider", () => {
  const apiRequestMock = vi.mocked(apiRequest);
  const setCsrfTokenMock = vi.mocked(setCsrfToken);

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("bootstraps user state from /auth/me", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/auth/me") {
        return {
          user: {
            id: "u1",
            username: "initial-user",
            email: "initial@example.com",
            createdAt: new Date().toISOString(),
          } satisfies User,
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderAuthProvider();

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("ready"),
    );
    expect(screen.getByTestId("username")).toHaveTextContent("initial-user");
  });

  it("updates user after login", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/auth/me") {
        return {
          user: {
            id: "u1",
            username: "initial-user",
            email: "initial@example.com",
            createdAt: new Date().toISOString(),
          } satisfies User,
        };
      }
      if (path === "/auth/login") {
        return {
          user: {
            id: "u2",
            username: "logged-user",
            email: "logged@example.com",
            createdAt: new Date().toISOString(),
          } satisfies User,
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("ready"),
    );

    fireEvent.click(screen.getByRole("button", { name: "login" }));

    await waitFor(() =>
      expect(screen.getByTestId("username")).toHaveTextContent("logged-user"),
    );
    expect(apiRequestMock).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      csrf: "required",
      body: {
        email: "user@example.com",
        password: "Password123!",
      },
    });
  });

  it("updates user after register", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/auth/me") {
        return {
          user: {
            id: "u1",
            username: "initial-user",
            email: "initial@example.com",
            createdAt: new Date().toISOString(),
          } satisfies User,
        };
      }
      if (path === "/auth/register") {
        return {
          user: {
            id: "u3",
            username: "new-user",
            email: "new@example.com",
            createdAt: new Date().toISOString(),
          } satisfies User,
        };
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("ready"),
    );

    fireEvent.click(screen.getByRole("button", { name: "register" }));

    await waitFor(() =>
      expect(screen.getByTestId("username")).toHaveTextContent("new-user"),
    );
    expect(apiRequestMock).toHaveBeenCalledWith("/auth/register", {
      method: "POST",
      csrf: "required",
      body: {
        username: "new-user",
        email: "new@example.com",
        password: "Password123!",
      },
    });
  });

  it("clears state and redirects after logout failure", async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path === "/auth/me") {
        return {
          user: {
            id: "u1",
            username: "initial-user",
            email: "initial@example.com",
            createdAt: new Date().toISOString(),
          } satisfies User,
        };
      }
      if (path === "/auth/logout") {
        throw new Error("network down");
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    renderAuthProvider();
    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("ready"),
    );

    fireEvent.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("username")).toHaveTextContent("none"),
    );
    expect(setCsrfTokenMock).toHaveBeenCalledWith(null);
    expect(replaceMock).toHaveBeenCalledWith("/auth/login");
  });

  it("throws when useAuth is used outside provider", () => {
    expect(() => render(<AuthProbe />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });
});
