function shouldRunOnDomain(allowedDomains, hostname) {
  if (!Array.isArray(allowedDomains) || allowedDomains.length === 0) {
    return false;
  }
  const normalizedHost = hostname.trim().toLowerCase();
  return allowedDomains.some(
    (domain) => domain.trim().toLowerCase() === normalizedHost,
  );
}

function resolvePartnerForHost(partnerDomainsMap, enabledPartnerSlugs, hostname) {
  const normalizedHost = hostname.trim().toLowerCase();
  if (!partnerDomainsMap || typeof partnerDomainsMap !== "object") {
    return null;
  }

  for (const slug of enabledPartnerSlugs) {
    const domains = partnerDomainsMap[slug];
    if (!Array.isArray(domains) || domains.length === 0) {
      continue;
    }
    if (shouldRunOnDomain(domains, normalizedHost)) {
      return slug;
    }
  }

  return null;
}

async function run() {
  const config = await chrome.storage.sync.get([
    "enabled",
    "allowedDomains",
    "partnerSlug",
    "enabledPartnerSlugs",
    "partnerDomainsMap",
  ]);
  if (!config.enabled) return;

  const enabledPartnerSlugs = Array.isArray(config.enabledPartnerSlugs)
    ? config.enabledPartnerSlugs
    : [];
  const partnerSlug =
    resolvePartnerForHost(
      config.partnerDomainsMap,
      enabledPartnerSlugs,
      window.location.hostname,
    ) ||
    (shouldRunOnDomain(config.allowedDomains, window.location.hostname)
      ? config.partnerSlug
      : null);

  if (!partnerSlug) {
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
      partnerSlug,
    },
  });
}

void run();
