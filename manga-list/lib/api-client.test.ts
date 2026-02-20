import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  getApiBaseUrl: vi.fn(() => "http://api.test"),
  getApiUrl: vi.fn((path: string) => `http://api.test${path}`),
}));

vi.mock("@/lib/csrf", () => ({
  createCsrfHeaders: vi.fn((headers: Record<string, string> = {}) => ({
    ...headers,
    "x-csrf-token": "csrf-token",
  })),
  ensureCsrfToken: vi.fn(async () => undefined),
  ensureAuthenticatedCsrfToken: vi.fn(async () => undefined),
  setCsrfToken: vi.fn(),
}));

import { ApiClientError, apiRequest } from "@/lib/api-client";
import {
  createCsrfHeaders,
  ensureAuthenticatedCsrfToken,
  ensureCsrfToken,
  setCsrfToken,
} from "@/lib/csrf";

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (header: string) =>
        header.toLowerCase() === "content-type" ? "application/json" : null,
    } as Headers,
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
}

describe("apiRequest", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("adds csrf headers and serializes JSON body when csrf is required", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ user: { id: "u1" } }));

    await apiRequest("/auth/login", {
      method: "POST",
      csrf: "required",
      body: { email: "user@example.com", password: "Password123!" },
    });

    expect(ensureCsrfToken).toHaveBeenCalledTimes(1);
    expect(createCsrfHeaders).toHaveBeenCalledWith({
      "Content-Type": "application/json",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": "csrf-token",
      },
      credentials: "include",
      body: JSON.stringify({
        email: "user@example.com",
        password: "Password123!",
      }),
    });
  });

  it("stores csrf token returned by backend responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ csrfToken: "new-token" }));

    await apiRequest("/auth/me");

    expect(setCsrfToken).toHaveBeenCalledWith("new-token");
  });

  it("throws ApiClientError for non-2xx responses", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { message: "Invalid credentials", code: "INVALID_CREDENTIALS" },
        401,
      ),
    );

    await expect(apiRequest("/auth/login")).rejects.toMatchObject({
      name: "ApiClientError",
      message: "Invalid credentials",
      status: 401,
      code: "INVALID_CREDENTIALS",
    } satisfies Partial<ApiClientError>);
  });

  it("refreshes authenticated csrf token when mode is authenticated-required", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiRequest("/manga/list/m1/favorite", {
      method: "PATCH",
      csrf: "authenticated-required",
      body: { isFavorite: true },
    });

    expect(ensureAuthenticatedCsrfToken).toHaveBeenCalledTimes(1);
    expect(createCsrfHeaders).toHaveBeenCalledWith({
      "Content-Type": "application/json",
    });
  });

  it("handles non-json responses and returns plain text payload", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {
        get: () => "text/plain",
      } as unknown as Headers,
      json: vi.fn(),
      text: vi.fn().mockResolvedValue("ok"),
    } as unknown as Response);

    const data = await apiRequest<string>("/health");

    expect(data).toBe("ok");
  });
});
