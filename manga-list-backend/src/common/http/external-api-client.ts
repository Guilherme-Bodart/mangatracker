import { Logger } from '@nestjs/common';

type CircuitState = {
  failures: number;
  openUntil: number;
};

type ExternalApiHttpClientOptions = {
  timeoutMs: number;
  retries: number;
  failureThreshold: number;
  cooldownMs: number;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
};

export class ExternalApiHttpClient {
  private readonly logger = new Logger(ExternalApiHttpClient.name);
  private readonly circuitByScope = new Map<string, CircuitState>();
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(private readonly options: ExternalApiHttpClientOptions) {
    this.initialBackoffMs = options.initialBackoffMs ?? 250;
    this.maxBackoffMs = options.maxBackoffMs ?? 2000;
  }

  async fetchWithRetry(
    url: string,
    scope: string = 'default',
  ): Promise<Response> {
    this.assertCircuitClosed(scope);

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.options.timeoutMs,
      );

      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);

        if (this.shouldRetryStatus(response.status)) {
          if (attempt < this.options.retries) {
            await this.sleep(this.getRetryDelayMs(attempt));
            continue;
          }

          this.recordFailure(scope, `retryable status ${response.status}`);
          return response;
        }

        this.recordSuccess(scope);
        return response;
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;

        if (attempt < this.options.retries) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }

        this.recordFailure(
          scope,
          error instanceof Error ? error.message : 'unknown error',
        );
      }
    }

    throw lastError ?? new Error('External API request failed');
  }

  async fetchJsonWithRetry<T>(
    url: string,
    scope: string = 'default',
  ): Promise<T | null> {
    const response = await this.fetchWithRetry(url, scope);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private getRetryDelayMs(attempt: number): number {
    return Math.min(this.initialBackoffMs * 2 ** attempt, this.maxBackoffMs);
  }

  private assertCircuitClosed(scope: string): void {
    const now = Date.now();
    const state = this.circuitByScope.get(scope);

    if (!state) {
      return;
    }

    if (state.openUntil > now) {
      throw new Error(
        `External API circuit is open for scope "${scope}" until ${new Date(state.openUntil).toISOString()}`,
      );
    }

    if (state.openUntil > 0 && state.openUntil <= now) {
      this.circuitByScope.set(scope, { failures: 0, openUntil: 0 });
    }
  }

  private recordSuccess(scope: string): void {
    this.circuitByScope.set(scope, { failures: 0, openUntil: 0 });
  }

  private recordFailure(scope: string, reason: string): void {
    const previous = this.circuitByScope.get(scope) ?? {
      failures: 0,
      openUntil: 0,
    };
    const failures = previous.failures + 1;

    if (failures >= this.options.failureThreshold) {
      const openUntil = Date.now() + this.options.cooldownMs;
      this.circuitByScope.set(scope, { failures: 0, openUntil });
      this.logger.warn(
        `Opening external API circuit for scope "${scope}" until ${new Date(openUntil).toISOString()} (${reason})`,
      );
      return;
    }

    this.circuitByScope.set(scope, { failures, openUntil: 0 });
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
