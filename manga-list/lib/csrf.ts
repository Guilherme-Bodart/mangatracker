import { getApiBaseUrl } from "@/lib/api-config";

let csrfTokenMemory: string | null = null;

export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

export function getCsrfToken(): string | null {
  return csrfTokenMemory || getCookieValue("csrf_token");
}

export function setCsrfToken(token: string | null): void {
  csrfTokenMemory = token;
}

export function createCsrfHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const csrfToken = getCsrfToken();
  if (!csrfToken) return headers;

  return {
    ...headers,
    "x-csrf-token": csrfToken,
  };
}

export async function ensureCsrfToken(
  apiUrl: string = getApiBaseUrl(),
): Promise<void> {
  const url = `${apiUrl}/auth/csrf?_t=${Date.now()}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return;
  const data = (await response.json()) as { csrfToken?: string };
  if (data.csrfToken) {
    setCsrfToken(data.csrfToken);
  }
}

export async function ensureAuthenticatedCsrfToken(
  apiUrl: string = getApiBaseUrl(),
): Promise<void> {
  const url = `${apiUrl}/auth/me?_t=${Date.now()}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) return;
  const data = (await response.json()) as { csrfToken?: string };
  if (data.csrfToken) {
    setCsrfToken(data.csrfToken);
  }
}
