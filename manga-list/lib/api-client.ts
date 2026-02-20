import {
  createCsrfHeaders,
  ensureAuthenticatedCsrfToken,
  ensureCsrfToken,
  setCsrfToken,
} from "@/lib/csrf";
import { getApiBaseUrl, getApiUrl } from "@/lib/api-config";

type CsrfMode = "none" | "required" | "if-present" | "authenticated-required";

type ApiRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  cache?: RequestCache;
  signal?: AbortSignal;
  csrf?: CsrfMode;
};

type ErrorPayload = {
  message?: string;
  error?: string;
  code?: string;
  details?: unknown;
};

export { getApiBaseUrl, getApiUrl };

export class ApiClientError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getApiErrorMessage(
  error: unknown,
  fallback: string = "Request failed",
): string {
  if (error instanceof ApiClientError && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    headers = {},
    body,
    cache,
    signal,
    csrf = "none",
  } = options;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (csrf === "required") {
    await ensureCsrfToken();
  }
  if (csrf === "authenticated-required") {
    await ensureAuthenticatedCsrfToken();
  }

  const requestHeaders: Record<string, string> = { ...headers };
  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    if (
      body instanceof FormData ||
      typeof body === "string" ||
      body instanceof URLSearchParams ||
      body instanceof Blob
    ) {
      requestBody = body as BodyInit;
    } else {
      requestHeaders["Content-Type"] =
        requestHeaders["Content-Type"] || "application/json";
      requestBody = JSON.stringify(body);
    }
  }

  const finalHeaders =
    csrf === "none" ? requestHeaders : createCsrfHeaders(requestHeaders);
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
    method,
    headers: finalHeaders,
    credentials: "include",
    ...(cache ? { cache } : {}),
    ...(signal ? { signal } : {}),
    ...(requestBody !== undefined ? { body: requestBody } : {}),
  });

  const parsed = await parseResponse(response);

  if (!response.ok) {
    throw toApiClientError(response.status, parsed);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "csrfToken" in parsed &&
    typeof (parsed as { csrfToken?: unknown }).csrfToken === "string"
  ) {
    setCsrfToken((parsed as { csrfToken: string }).csrfToken);
  }

  return parsed as T;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiClientError(status: number, payload: unknown): ApiClientError {
  if (payload && typeof payload === "object") {
    const parsed = payload as ErrorPayload;
    const message =
      parsed.message || parsed.error || `Request failed with status ${status}`;
    return new ApiClientError(message, status, parsed.code, parsed.details);
  }

  if (typeof payload === "string" && payload.trim()) {
    return new ApiClientError(payload, status);
  }

  return new ApiClientError(`Request failed with status ${status}`, status);
}
