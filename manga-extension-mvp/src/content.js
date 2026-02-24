function shouldRunOnDomain(allowedDomains, hostname) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }
  const normalizedHost = hostname.trim().toLowerCase();
  return allowedDomains.some(
    (domain) => domain.trim().toLowerCase() === normalizedHost,
  );
}

async function run() {
  const config = await chrome.storage.sync.get([
    "enabled",
    "allowedDomains",
    "partnerSlug",
  ]);
  if (!config.enabled) return;
  if (!shouldRunOnDomain(config.allowedDomains, window.location.hostname)) {
    return;
  }

  const detectFn = globalThis.detectMangaPayload;
  if (typeof detectFn !== "function") {
    console.error("detectMangaPayload is not available");
    return;
  }

  const payload = detectFn(document, window.location);
  if (!payload) return;

  chrome.runtime.sendMessage({
    type: "MANGA_PROGRESS_DETECTED",
    payload: {
      ...payload,
      partnerSlug: config.partnerSlug,
    },
  });
}

void run();
