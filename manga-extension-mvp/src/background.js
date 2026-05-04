const DEFAULT_API_BASE_URL = "https://mangatracker-qkdy.onrender.com";
const SYNC_QUEUE_STORAGE_KEY = "syncQueueV1";
const SYNC_QUEUE_RETRY_ALARM = "syncQueueRetryAlarm";
const PARTNER_CONFIG_REFRESH_ALARM = "partnerConfigRefresh";
const MAX_QUEUE_SIZE = 200;
const MAX_DRAIN_ITEMS_PER_RUN = 30;
const INITIAL_RETRY_DELAY_MS = 5_000;
const CONFIG_RETRY_DELAY_MS = 5 * 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60_000;
const MAX_ATTEMPTS = 20;
const SYNC_REQUEST_TIMEOUT_MS = 15_000;
const EXTERNAL_CONNECT_MESSAGE_TYPE = "MANGA_TRACKER_CONNECT_CODE";
const DYNAMIC_CONTENT_SCRIPT_ID = "manga-tracker-dynamic-content";
const PARTNER_CONFIG_REFRESH_INTERVAL_MINUTES = 15;
const KNOWN_PARSER_MODES = new Set([
  "generic",
  "mangalivre",
  "seriesSlugNumberPath",
  "singleSlugNumberPath",
]);

let drainQueuePromise = null;
let queueLock = Promise.resolve();

async function getConfig() {
  return chrome.storage.sync.get([
    "apiBaseUrl",
    "partnerSlug",
    "accessToken",
    "partnerTokens",
    "enabled",
    "enabledPartnerSlugs",
    "partnerDomainsMap",
    "allowedDomains",
  ]);
}

function buildIdempotencyKey(payload, occurredAtMs = Date.now()) {
  const nowBucket = Math.floor(occurredAtMs / 60000);
  return `${payload.sourceDomain}:${payload.externalMangaId}:${payload.chapter}:${nowBucket}`;
}

function normalizePayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return null;
  }

  const partnerSlug = String(rawPayload.partnerSlug || "").trim();
  const externalMangaId = String(rawPayload.externalMangaId || "").trim();
  const title = String(rawPayload.title || "").trim().slice(0, 300);
  const sourceDomain = String(rawPayload.sourceDomain || "").trim().toLowerCase();
  const chapter = Number.parseInt(String(rawPayload.chapter || ""), 10);

  if (!partnerSlug || !externalMangaId || !title || !sourceDomain) {
    return null;
  }

  if (!Number.isFinite(chapter) || chapter <= 0) {
    return null;
  }

  return {
    partnerSlug,
    externalMangaId,
    title,
    sourceDomain,
    chapter,
  };
}

function queueFingerprint(payload) {
  return `${payload.partnerSlug}:${payload.sourceDomain}:${payload.externalMangaId}`;
}

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function buildQueueItem(payload, nowMs = Date.now()) {
  return {
    id: randomId(),
    createdAt: nowMs,
    updatedAt: nowMs,
    nextAttemptAt: nowMs,
    attemptCount: 0,
    idempotencyKey: buildIdempotencyKey(payload, nowMs),
    payload,
  };
}

async function loadQueue() {
  const data = await chrome.storage.local.get([SYNC_QUEUE_STORAGE_KEY]);
  if (!Array.isArray(data[SYNC_QUEUE_STORAGE_KEY])) {
    return [];
  }
  return data[SYNC_QUEUE_STORAGE_KEY];
}

async function saveQueue(queue) {
  await chrome.storage.local.set({
    [SYNC_QUEUE_STORAGE_KEY]: queue,
  });
}

async function scheduleDrainAlarm(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    await chrome.alarms.clear(SYNC_QUEUE_RETRY_ALARM);
    return;
  }

  let nextAttemptAt = Number.POSITIVE_INFINITY;
  for (const item of queue) {
    const candidate = Number(item?.nextAttemptAt);
    if (Number.isFinite(candidate) && candidate < nextAttemptAt) {
      nextAttemptAt = candidate;
    }
  }

  if (!Number.isFinite(nextAttemptAt)) {
    nextAttemptAt = Date.now() + CONFIG_RETRY_DELAY_MS;
  }

  const when = Math.max(Date.now() + 1_000, nextAttemptAt);
  chrome.alarms.create(SYNC_QUEUE_RETRY_ALARM, { when });
}

function computeRetryDelayMs(attemptCount, baseMs = INITIAL_RETRY_DELAY_MS) {
  const exponent = Math.max(0, Math.min(10, attemptCount));
  const raw = Math.min(MAX_RETRY_DELAY_MS, baseMs * 2 ** exponent);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.floor(raw * jitter);
}

function isRetryableStatus(statusCode) {
  if (statusCode >= 500) {
    return true;
  }
  return [401, 403, 408, 425, 429].includes(statusCode);
}

function withQueueLock(task) {
  const run = queueLock.then(task, task);
  queueLock = run.catch(() => {});
  return run;
}

function normalizeApiBaseUrl(rawValue) {
  return String(rawValue || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
}

function normalizeParserMode(value) {
  const normalized = String(value || "").trim();
  return KNOWN_PARSER_MODES.has(normalized) ? normalized : null;
}

function normalizeSelectorList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase();
}

function stripDomainInput(value) {
  return normalizeDomain(value)
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .trim();
}

function buildOriginPatternsForDomain(domain) {
  const cleaned = stripDomainInput(domain);
  if (!cleaned) {
    return [];
  }

  const patterns = new Set();

  if (cleaned.startsWith("*.")) {
    const base = cleaned.slice(2);
    if (!base) return [];
    patterns.add(`*://*.${base}/*`);
    patterns.add(`*://${base}/*`);
    return Array.from(patterns);
  }

  patterns.add(`*://${cleaned}/*`);
  if (!cleaned.startsWith("www.")) {
    patterns.add(`*://www.${cleaned}/*`);
  }

  return Array.from(patterns);
}

function buildEnabledOrigins(config) {
  if (!config?.enabled) {
    return [];
  }

  const enabledPartnerSlugs = Array.isArray(config.enabledPartnerSlugs)
    ? config.enabledPartnerSlugs
    : [];
  const partnerDomainsMap =
    config.partnerDomainsMap && typeof config.partnerDomainsMap === "object"
      ? config.partnerDomainsMap
      : {};

  const origins = new Set();
  for (const slug of enabledPartnerSlugs) {
    const domains = Array.isArray(partnerDomainsMap[slug]) ? partnerDomainsMap[slug] : [];
    for (const domain of domains) {
      for (const pattern of buildOriginPatternsForDomain(domain)) {
        origins.add(pattern);
      }
    }
  }

  return Array.from(origins);
}

function normalizePartnerRecord(partner) {
  const slug = toNonEmptyString(partner?.slug, 100);
  const name = toNonEmptyString(partner?.name, 200);
  if (!slug || !name) {
    return null;
  }

  const allowedDomains = Array.isArray(partner?.allowedDomains)
    ? partner.allowedDomains.map((domain) => normalizeDomain(domain)).filter(Boolean)
    : [];

  return {
    slug,
    name,
    allowedDomains,
    parserMode: normalizeParserMode(partner?.parserMode),
    parserTitleSelectors: normalizeSelectorList(partner?.parserTitleSelectors),
    parserChapterSelectors: normalizeSelectorList(partner?.parserChapterSelectors),
  };
}

function buildPartnerDomainsMap(partners) {
  const map = {};
  for (const partner of partners) {
    map[partner.slug] = Array.isArray(partner.allowedDomains)
      ? partner.allowedDomains
      : [];
  }
  return map;
}

function buildPartnerParserMap(partners) {
  const map = {};
  for (const partner of partners) {
    map[partner.slug] = {
      parserMode: normalizeParserMode(partner.parserMode),
      parserTitleSelectors: normalizeSelectorList(partner.parserTitleSelectors),
      parserChapterSelectors: normalizeSelectorList(partner.parserChapterSelectors),
    };
  }
  return map;
}

function buildLegacyCompatibility(partners, enabledPartnerSlugs, partnerTokens, fallbackSlug) {
  for (const slug of enabledPartnerSlugs) {
    const partner = partners.find((candidate) => candidate.slug === slug);
    const token = partnerTokens[slug];
    if (!partner || !token) {
      continue;
    }

    return {
      partnerSlug: slug,
      accessToken: token,
      allowedDomains: partner.allowedDomains,
    };
  }

  if (fallbackSlug) {
    const partner = partners.find((candidate) => candidate.slug === fallbackSlug);
    if (partner) {
      return {
        partnerSlug: fallbackSlug,
        accessToken: partnerTokens[fallbackSlug] || "",
        allowedDomains: partner.allowedDomains,
      };
    }
  }

  return {
    partnerSlug: "",
    accessToken: "",
    allowedDomains: [],
  };
}

async function fetchPublicPartners(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/integrations/partners/public`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`partners/public failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(normalizePartnerRecord).filter(Boolean);
}

async function schedulePartnerConfigRefresh() {
  chrome.alarms.create(PARTNER_CONFIG_REFRESH_ALARM, {
    periodInMinutes: PARTNER_CONFIG_REFRESH_INTERVAL_MINUTES,
  });
}

async function syncRemotePartnerCatalog(trigger = "unknown") {
  const current = await chrome.storage.sync.get([
    "apiBaseUrl",
    "enabledPartnerSlugs",
    "partnerTokens",
    "partnerDomainsMap",
    "partnerParserMap",
    "partnerSlug",
    "accessToken",
    "allowedDomains",
  ]);

  const apiBaseUrl = normalizeApiBaseUrl(current.apiBaseUrl);
  const partners = await fetchPublicPartners(apiBaseUrl);
  const enabledPartnerSlugs = Array.isArray(current.enabledPartnerSlugs)
    ? current.enabledPartnerSlugs.filter((slug) => typeof slug === "string" && slug.trim())
    : [];
  const partnerTokens =
    current.partnerTokens && typeof current.partnerTokens === "object"
      ? current.partnerTokens
      : {};
  const currentDomainsMap =
    current.partnerDomainsMap && typeof current.partnerDomainsMap === "object"
      ? current.partnerDomainsMap
      : {};
  const currentParserMap =
    current.partnerParserMap && typeof current.partnerParserMap === "object"
      ? current.partnerParserMap
      : {};
  const nextDomainsMap = {
    ...currentDomainsMap,
    ...buildPartnerDomainsMap(partners),
  };
  const nextParserMap = {
    ...currentParserMap,
    ...buildPartnerParserMap(partners),
  };
  const legacy = buildLegacyCompatibility(
    partners,
    enabledPartnerSlugs,
    partnerTokens,
    current.partnerSlug,
  );

  await chrome.storage.sync.set({
    apiBaseUrl,
    availablePartners: partners,
    partnerDomainsMap: nextDomainsMap,
    partnerParserMap: nextParserMap,
    partnerSlug: legacy.partnerSlug || current.partnerSlug || "",
    accessToken: legacy.accessToken || current.accessToken || "",
    allowedDomains:
      legacy.allowedDomains.length > 0
        ? legacy.allowedDomains
        : Array.isArray(current.allowedDomains)
          ? current.allowedDomains
          : [],
  });

  console.log("Partner catalog sync completed", {
    trigger,
    partners: partners.length,
  });
}

async function filterGrantedOrigins(origins) {
  if (!Array.isArray(origins) || origins.length === 0) {
    return [];
  }

  if (!chrome.permissions?.contains) {
    return origins;
  }

  const granted = [];
  for (const origin of origins) {
    try {
      const has = await chrome.permissions.contains({ origins: [origin] });
      if (has) {
        granted.push(origin);
      }
    } catch {
      // Ignore malformed/unsupported origin patterns.
    }
  }

  return granted;
}

async function syncDynamicContentScript(trigger = "unknown") {
  if (!chrome.scripting?.registerContentScripts) {
    return;
  }

  const config = await chrome.storage.sync.get([
    "enabled",
    "enabledPartnerSlugs",
    "partnerDomainsMap",
  ]);

  const desiredOrigins = buildEnabledOrigins(config);
  const grantedOrigins = await filterGrantedOrigins(desiredOrigins);

  const existing = await chrome.scripting
    .getRegisteredContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] })
    .catch(() => []);

  if (grantedOrigins.length === 0) {
    if (existing.length > 0) {
      await chrome.scripting.unregisterContentScripts({
        ids: [DYNAMIC_CONTENT_SCRIPT_ID],
      });
    }
    return;
  }

  const scriptDefinition = {
    id: DYNAMIC_CONTENT_SCRIPT_ID,
    js: ["src/adapters.js", "src/content.js"],
    matches: grantedOrigins,
    runAt: "document_idle",
    persistAcrossSessions: true,
  };

  if (existing.length > 0) {
    await chrome.scripting.updateContentScripts([scriptDefinition]);
  } else {
    await chrome.scripting.registerContentScripts([scriptDefinition]);
  }

  console.log("Content script sync completed", {
    trigger,
    origins: grantedOrigins.length,
  });
}

function toNonEmptyString(value, maxLength = 500) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength);
}

function normalizeExternalConnectPayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") {
    return null;
  }

  const partnerSlug = toNonEmptyString(rawPayload.partnerSlug, 100);
  const code = toNonEmptyString(rawPayload.code, 500);
  const sourceDomain = normalizeDomain(rawPayload.sourceDomain);
  const apiBaseUrlRaw = toNonEmptyString(rawPayload.apiBaseUrl, 500);

  if (!partnerSlug || !code) {
    return null;
  }

  return {
    partnerSlug,
    code,
    sourceDomain: sourceDomain || undefined,
    apiBaseUrl: apiBaseUrlRaw || undefined,
  };
}

async function exchangeConnectionCode(params) {
  const apiBaseUrl = normalizeApiBaseUrl(params.apiBaseUrl);
  const body = {
    partnerSlug: params.partnerSlug,
    code: params.code,
    ...(params.sourceDomain ? { sourceDomain: params.sourceDomain } : {}),
  };

  const response = await fetch(`${apiBaseUrl}/integrations/connect/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`connect/exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const accessToken = toNonEmptyString(data?.accessToken, 2000);
  if (!accessToken) {
    throw new Error("connect/exchange response missing accessToken");
  }

  return {
    accessToken,
    apiBaseUrl,
  };
}

async function saveConnectedPartnerToken(params) {
  const current = await chrome.storage.sync.get([
    "enabled",
    "apiBaseUrl",
    "enabledPartnerSlugs",
    "partnerTokens",
    "partnerDomainsMap",
    "partnerSlug",
    "accessToken",
    "allowedDomains",
  ]);

  const enabledPartnerSlugs = Array.isArray(current.enabledPartnerSlugs)
    ? current.enabledPartnerSlugs.filter((slug) => typeof slug === "string" && slug.trim())
    : [];
  const partnerTokens =
    current.partnerTokens && typeof current.partnerTokens === "object"
      ? { ...current.partnerTokens }
      : {};
  const partnerDomainsMap =
    current.partnerDomainsMap && typeof current.partnerDomainsMap === "object"
      ? { ...current.partnerDomainsMap }
      : {};

  if (!enabledPartnerSlugs.includes(params.partnerSlug)) {
    enabledPartnerSlugs.push(params.partnerSlug);
  }

  partnerTokens[params.partnerSlug] = params.accessToken;

  if (params.sourceDomain) {
    const existingDomains = Array.isArray(partnerDomainsMap[params.partnerSlug])
      ? partnerDomainsMap[params.partnerSlug]
      : [];
    const nextDomains = new Set(
      existingDomains.map((domain) => normalizeDomain(domain)).filter(Boolean),
    );
    nextDomains.add(params.sourceDomain);
    partnerDomainsMap[params.partnerSlug] = Array.from(nextDomains);
  }

  await chrome.storage.sync.set({
    enabled: true,
    apiBaseUrl: params.apiBaseUrl || current.apiBaseUrl || DEFAULT_API_BASE_URL,
    enabledPartnerSlugs,
    partnerTokens,
    partnerDomainsMap,
    partnerSlug: params.partnerSlug,
    accessToken: params.accessToken,
    allowedDomains: Array.isArray(partnerDomainsMap[params.partnerSlug])
      ? partnerDomainsMap[params.partnerSlug]
      : Array.isArray(current.allowedDomains)
        ? current.allowedDomains
        : [],
  });
}

async function connectFromExternalMessage(rawPayload) {
  const payload = normalizeExternalConnectPayload(rawPayload);
  if (!payload) {
    return {
      ok: false,
      error: "invalid payload",
    };
  }

  const exchangeResult = await exchangeConnectionCode(payload);
  await saveConnectedPartnerToken({
    partnerSlug: payload.partnerSlug,
    sourceDomain: payload.sourceDomain,
    accessToken: exchangeResult.accessToken,
    apiBaseUrl: exchangeResult.apiBaseUrl,
  });
  try {
    await syncRemotePartnerCatalog("external-connect");
  } catch (error) {
    console.warn("Partner catalog sync failed after external connect", error);
  }

  return {
    ok: true,
    partnerSlug: payload.partnerSlug,
  };
}

async function sendSyncNow(item) {
  const config = await getConfig();
  const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);
  if (!config.enabled) {
    return {
      outcome: "retry",
      reason: "extension-disabled",
      status: null,
      message: "extension disabled",
      retryDelayMs: CONFIG_RETRY_DELAY_MS,
    };
  }

  const payload = item.payload;
  const partnerSlug = payload.partnerSlug || config.partnerSlug;
  const partnerTokens =
    config.partnerTokens && typeof config.partnerTokens === "object"
      ? config.partnerTokens
      : {};
  const accessToken =
    (partnerSlug && partnerTokens[partnerSlug]) || config.accessToken;
  if (!partnerSlug || !accessToken) {
    return {
      outcome: "retry",
      reason: "missing-token-or-partner",
      status: null,
      message: "missing token or partner slug",
      retryDelayMs: CONFIG_RETRY_DELAY_MS,
    };
  }

  const body = {
    partnerSlug,
    externalMangaId: payload.externalMangaId,
    title: payload.title,
    chapter: payload.chapter,
    sourceDomain: payload.sourceDomain,
  };

  let response;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, SYNC_REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(`${apiBaseUrl}/integrations/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "x-idempotency-key": item.idempotencyKey,
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
  } catch (error) {
    return {
      outcome: "retry",
      reason: "network-error",
      status: null,
      message: error instanceof Error ? error.message : "network error",
    };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    if (isRetryableStatus(response.status)) {
      return {
        outcome: "retry",
        reason: "retryable-http-status",
        status: response.status,
        message: text.slice(0, 500),
      };
    }

    return {
      outcome: "drop",
      reason: "non-retryable-http-status",
      status: response.status,
      message: text.slice(0, 500),
    };
  }

  const data = await response.json();
  return {
    outcome: "success",
    status: response.status,
    data,
  };
}

function trimQueueToLimit(queue) {
  if (queue.length <= MAX_QUEUE_SIZE) {
    return queue;
  }

  const sorted = [...queue].sort((a, b) => {
    const left = Number(a?.createdAt) || 0;
    const right = Number(b?.createdAt) || 0;
    return left - right;
  });

  const overflow = queue.length - MAX_QUEUE_SIZE;
  const idsToRemove = new Set(sorted.slice(0, overflow).map((item) => item.id));
  return queue.filter((item) => !idsToRemove.has(item.id));
}

function markItemForRetry(item, result) {
  const nowMs = Date.now();
  const retryDelayMs = Number.isFinite(result.retryDelayMs)
    ? result.retryDelayMs
    : computeRetryDelayMs(item.attemptCount);

  return {
    ...item,
    updatedAt: nowMs,
    attemptCount: Number(item.attemptCount || 0) + 1,
    nextAttemptAt: nowMs + retryDelayMs,
    lastError: {
      reason: result.reason || "retry",
      status: result.status || null,
      message: String(result.message || "retry"),
      at: nowMs,
    },
  };
}

function mergeOrInsertQueueItem(queue, nextPayload) {
  const nowMs = Date.now();
  const fingerprint = queueFingerprint(nextPayload);
  const existingIndex = queue.findIndex(
    (item) => queueFingerprint(item.payload || {}) === fingerprint,
  );

  if (existingIndex === -1) {
    queue.push(buildQueueItem(nextPayload, nowMs));
    return;
  }

  const existingItem = queue[existingIndex];
  const existingChapter = Number(existingItem?.payload?.chapter) || 0;

  if (nextPayload.chapter > existingChapter) {
    queue[existingIndex] = {
      ...existingItem,
      payload: nextPayload,
      idempotencyKey: buildIdempotencyKey(nextPayload, nowMs),
      updatedAt: nowMs,
      nextAttemptAt: nowMs,
      lastError: null,
    };
    return;
  }

  if (nextPayload.chapter === existingChapter) {
    queue[existingIndex] = {
      ...existingItem,
      payload: {
        ...existingItem.payload,
        title: nextPayload.title || existingItem.payload.title,
      },
      updatedAt: nowMs,
      nextAttemptAt: Math.min(Number(existingItem.nextAttemptAt) || nowMs, nowMs),
    };
  }
}

async function enqueueSync(rawPayload) {
  const payload = normalizePayload(rawPayload);
  if (!payload) {
    return;
  }

  await withQueueLock(async () => {
    const queue = await loadQueue();
    mergeOrInsertQueueItem(queue, payload);
    const trimmedQueue = trimQueueToLimit(queue);
    await saveQueue(trimmedQueue);
    await scheduleDrainAlarm(trimmedQueue);
  });

  void drainQueue("enqueue");
}

async function doDrainQueue(trigger = "unknown") {
  await withQueueLock(async () => {
    const queue = await loadQueue();
    if (!Array.isArray(queue) || queue.length === 0) {
      await scheduleDrainAlarm([]);
      return;
    }

    queue.sort((left, right) => {
      const leftAttempt = Number(left?.nextAttemptAt) || 0;
      const rightAttempt = Number(right?.nextAttemptAt) || 0;
      if (leftAttempt !== rightAttempt) {
        return leftAttempt - rightAttempt;
      }
      return (Number(left?.createdAt) || 0) - (Number(right?.createdAt) || 0);
    });

    let processed = 0;
    while (processed < MAX_DRAIN_ITEMS_PER_RUN) {
      const nowMs = Date.now();
      const nextIndex = queue.findIndex(
        (item) => Number(item?.nextAttemptAt) <= nowMs,
      );
      if (nextIndex === -1) {
        break;
      }

      const item = queue[nextIndex];
      const result = await sendSyncNow(item);
      processed += 1;

      if (result.outcome === "success") {
        queue.splice(nextIndex, 1);
        await saveQueue(queue);
        continue;
      }

      if (result.outcome === "drop") {
        console.error("Dropping sync event from queue:", {
          reason: result.reason,
          status: result.status,
          message: result.message,
          payload: item.payload,
        });
        queue.splice(nextIndex, 1);
        await saveQueue(queue);
        continue;
      }

      const currentAttempts = Number(item.attemptCount || 0);
      if (currentAttempts + 1 >= MAX_ATTEMPTS) {
        console.error("Dropping sync event after max attempts:", {
          attempts: currentAttempts + 1,
          payload: item.payload,
          lastError: result,
        });
        queue.splice(nextIndex, 1);
        await saveQueue(queue);
        continue;
      }

      queue[nextIndex] = markItemForRetry(item, result);
      await saveQueue(queue);
    }

    await scheduleDrainAlarm(queue);
    console.log("Sync queue drain completed:", {
      trigger,
      queued: queue.length,
      processed,
    });
  });
}

function drainQueue(trigger = "unknown") {
  if (drainQueuePromise) {
    return drainQueuePromise;
  }

  drainQueuePromise = doDrainQueue(trigger).finally(() => {
    drainQueuePromise = null;
  });
  return drainQueuePromise;
}

async function getQueueStats() {
  const queue = await loadQueue();
  const nowMs = Date.now();
  const dueCount = queue.filter(
    (item) => Number(item?.nextAttemptAt) <= nowMs,
  ).length;
  const nextAttemptAt = queue.reduce((min, item) => {
    const value = Number(item?.nextAttemptAt);
    if (!Number.isFinite(value)) return min;
    return Math.min(min, value);
  }, Number.POSITIVE_INFINITY);

  return {
    size: queue.length,
    dueCount,
    nextAttemptAt: Number.isFinite(nextAttemptAt) ? nextAttemptAt : null,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MANGA_PROGRESS_DETECTED" && message.payload) {
    void enqueueSync(message.payload)
      .then(() => {
        sendResponse?.({ accepted: true });
      })
      .catch((error) => {
        sendResponse?.({
          accepted: false,
          error: error instanceof Error ? error.message : "enqueue failed",
        });
      });
    return true;
  }

  if (message?.type === "MANGA_SYNC_QUEUE_STATS") {
    void getQueueStats()
      .then((stats) => {
        sendResponse?.(stats);
      })
      .catch((error) => {
        sendResponse?.({
          size: 0,
          dueCount: 0,
          nextAttemptAt: null,
          error: error instanceof Error ? error.message : "stats failed",
        });
      });
    return true;
  }

  if (message?.type === "MANGA_SYNC_QUEUE_DRAIN") {
    void drainQueue("manual")
      .then(() => {
        sendResponse?.({ ok: true });
      })
      .catch((error) => {
        sendResponse?.({
          ok: false,
          error: error instanceof Error ? error.message : "drain failed",
        });
      });
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type !== EXTERNAL_CONNECT_MESSAGE_TYPE || !message.payload) {
    return;
  }

  void connectFromExternalMessage(message.payload)
    .then((result) => {
      sendResponse?.(result);
    })
    .catch((error) => {
      sendResponse?.({
        ok: false,
        error: error instanceof Error ? error.message : "external connect failed",
      });
    });

  return true;
});

chrome.runtime.onStartup.addListener(() => {
  void syncRemotePartnerCatalog("startup").catch((error) => {
    console.warn("Partner catalog sync failed on startup", error);
  });
  void schedulePartnerConfigRefresh();
  void syncDynamicContentScript("startup");
  void drainQueue("startup");
});

chrome.runtime.onInstalled.addListener(() => {
  void syncRemotePartnerCatalog("installed").catch((error) => {
    console.warn("Partner catalog sync failed on install", error);
  });
  void schedulePartnerConfigRefresh();
  void syncDynamicContentScript("installed");
  void drainQueue("installed");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === SYNC_QUEUE_RETRY_ALARM) {
    void drainQueue("alarm");
    return;
  }

  if (alarm?.name === PARTNER_CONFIG_REFRESH_ALARM) {
    void syncRemotePartnerCatalog("alarm").catch((error) => {
      console.warn("Partner catalog sync failed from alarm", error);
    });
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;

  if (
    changes.enabled ||
    changes.enabledPartnerSlugs ||
    changes.partnerDomainsMap
  ) {
    void syncDynamicContentScript("storage-change");
  }

  if (changes.apiBaseUrl) {
    void syncRemotePartnerCatalog("api-base-change").catch((error) => {
      console.warn("Partner catalog sync failed after apiBaseUrl change", error);
    });
  }
});

chrome.permissions?.onAdded?.addListener(() => {
  void syncDynamicContentScript("permission-added");
});

chrome.permissions?.onRemoved?.addListener(() => {
  void syncDynamicContentScript("permission-removed");
});

void schedulePartnerConfigRefresh();
void syncRemotePartnerCatalog("boot").catch((error) => {
  console.warn("Partner catalog sync failed on boot", error);
});
void syncDynamicContentScript("boot");
