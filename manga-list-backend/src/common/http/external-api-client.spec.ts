import { ExternalApiHttpClient } from './external-api-client';

describe('ExternalApiHttpClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries transient 5xx responses and eventually succeeds', async () => {
    const client = new ExternalApiHttpClient({
      timeoutMs: 1000,
      retries: 2,
      failureThreshold: 5,
      cooldownMs: 1000,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const response = await client.fetchWithRetry(
      'https://example.com/resource',
      'jikan',
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('opens circuit after repeated failures and short-circuits next calls', async () => {
    const client = new ExternalApiHttpClient({
      timeoutMs: 1000,
      retries: 0,
      failureThreshold: 2,
      cooldownMs: 60000,
    });

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network down'));

    await expect(
      client.fetchWithRetry('https://example.com/resource', 'mangadex'),
    ).rejects.toThrow('network down');
    await expect(
      client.fetchWithRetry('https://example.com/resource', 'mangadex'),
    ).rejects.toThrow('network down');

    await expect(
      client.fetchWithRetry('https://example.com/resource', 'mangadex'),
    ).rejects.toThrow('circuit is open');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
