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
  if (getCsrfToken()) return;

  await fetch(`${apiUrl}/auth/csrf`, {
    method: "GET",
    credentials: "include",
  });
}
