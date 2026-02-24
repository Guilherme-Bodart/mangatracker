const DEFAULT_API_BASE_URL = "http://localhost:3001";

async function getConfig() {
  return chrome.storage.sync.get([
    "apiBaseUrl",
    "partnerSlug",
    "accessToken",
    "enabled",
  ]);
}

function buildIdempotencyKey(payload) {
  const nowBucket = Math.floor(Date.now() / 60000);
  return `${payload.sourceDomain}:${payload.externalMangaId}:${payload.chapter}:${nowBucket}`;
}

async function sendSync(payload) {
  const config = await getConfig();
  const apiBaseUrl = (config.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  if (!config.enabled) return;
  if (!config.partnerSlug || !config.accessToken) return;

  const body = {
    partnerSlug: config.partnerSlug,
    externalMangaId: payload.externalMangaId,
    title: payload.title,
    chapter: payload.chapter,
    sourceDomain: payload.sourceDomain,
  };

  const response = await fetch(`${apiBaseUrl}/integrations/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.accessToken}`,
      "x-idempotency-key": buildIdempotencyKey(payload),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Integration sync failed:", response.status, text);
    return;
  }

  const data = await response.json();
  console.log("Integration sync success:", data);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "MANGA_PROGRESS_DETECTED" && message.payload) {
    void sendSync(message.payload);
  }
});
