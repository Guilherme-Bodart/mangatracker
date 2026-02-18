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
  return getCookieValue("csrf_token");
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

export async function ensureCsrfToken(apiUrl: string): Promise<void> {
  const url = `${apiUrl}/auth/csrf?_t=${Date.now()}`;
  await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "cache-control": "no-cache, no-store, must-revalidate",
      pragma: "no-cache",
    },
  });
}

export async function ensureAuthenticatedCsrfToken(
  apiUrl: string,
): Promise<void> {
  const url = `${apiUrl}/auth/me?_t=${Date.now()}`;
  await fetch(url, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: {
      "cache-control": "no-cache, no-store, must-revalidate",
      pragma: "no-cache",
    },
  });
}
