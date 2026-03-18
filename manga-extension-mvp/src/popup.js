const DEFAULT_API_BASE_URL = "https://mangatracker-qkdy.onrender.com";
const DEFAULT_FRONTEND_BASE_URL = "https://mangastracker.vercel.app";

const I18N = {
  en: {
    subtitle: "Choose which sites can sync your reading progress.",
    extensionActive: "Extension active",
    partnerToConnect: "Partner to connect",
    connectCode: "Connect code",
    connectCodePlaceholder: "Paste connect code",
    connectAccount: "Connect account",
    disconnect: "Disconnect",
    openIntegrations: "Open Integrations",
    openSite: "Open Manga Tracker",
    noPartners: "No active partners available.",
    loadingPartners: "Loading partners...",
    connected: "Connected",
    notConnected: "Not connected",
    slug: "Slug",
    statusEnterCode: "Enter a connect code.",
    statusOpenConnectFlow: "Opening Manga Tracker connect flow...",
    statusSelectPartner: "Select a valid partner.",
    statusConnecting: "Connecting account...",
    statusExchangeFail: "Connection failed",
    statusNoToken: "Response missing accessToken.",
    statusConnected: "Account connected successfully.",
    statusConnectError: "Connection error",
    statusSelectDisconnect: "Select a partner to disconnect.",
    statusDisconnected: "Partner disconnected.",
    statusSaved: "Settings saved.",
    statusPartnerSelectionSaved: "Tracked sites updated.",
    diagnosticsTitle: "Diagnostics",
    diagnosticsRefresh: "Refresh",
    diagnosticsRetryNow: "Retry now",
    diagQueueSize: "Queue",
    diagDueCount: "Due now",
    diagNextRetry: "Next retry",
    diagEnabledPartners: "Enabled",
    diagConnectedPartners: "Connected",
    diagLastUpdate: "Last update",
    diagApiBase: "API base",
    diagNever: "never",
    diagUnknown: "unknown",
    statusDiagnosticsLoaded: "Diagnostics updated.",
    statusDiagnosticsLoadError: "Diagnostics failed",
    statusDiagnosticsDrainOk: "Queue retry started.",
    statusDiagnosticsDrainError: "Failed to retry queue",
  },
  pt: {
    subtitle: "Escolha os sites que podem sincronizar leitura.",
    extensionActive: "Extensão ativa",
    partnerToConnect: "Parceiro para conectar",
    connectCode: "Código de conexão",
    connectCodePlaceholder: "Cole código de conexão",
    connectAccount: "Conectar conta",
    disconnect: "Desconectar",
    openIntegrations: "Abrir Integrações",
    openSite: "Abrir Manga Tracker",
    noPartners: "Nenhum parceiro ativo disponível.",
    loadingPartners: "Carregando parceiros...",
    connected: "Conectado",
    notConnected: "Não conectado",
    slug: "Slug",
    statusEnterCode: "Informe o código de conexão.",
    statusOpenConnectFlow: "Abrindo fluxo de conexão no Manga Tracker...",
    statusSelectPartner: "Selecione um parceiro válido.",
    statusConnecting: "Conectando conta...",
    statusExchangeFail: "Falha na conexão",
    statusNoToken: "Resposta sem accessToken.",
    statusConnected: "Conta conectada com sucesso.",
    statusConnectError: "Erro na conexão",
    statusSelectDisconnect: "Selecione um parceiro para desconectar.",
    statusDisconnected: "Parceiro desconectado.",
    statusSaved: "Configurações salvas.",
    statusPartnerSelectionSaved: "Seleção de sites atualizada.",
    diagnosticsTitle: "Diagnóstico",
    diagnosticsRefresh: "Atualizar",
    diagnosticsRetryNow: "Forçar retry agora",
    diagQueueSize: "Fila",
    diagDueCount: "Prontos agora",
    diagNextRetry: "Próximo retry",
    diagEnabledPartners: "Habilitados",
    diagConnectedPartners: "Conectados",
    diagLastUpdate: "Última atualização",
    diagApiBase: "API base",
    diagNever: "nunca",
    diagUnknown: "desconhecido",
    statusDiagnosticsLoaded: "Diagnóstico atualizado.",
    statusDiagnosticsLoadError: "Falha no diagnóstico",
    statusDiagnosticsDrainOk: "Retry da fila iniciado.",
    statusDiagnosticsDrainError: "Falha ao reprocessar fila",
  },
};

const state = {
  lang: "en",
  partners: [],
  apiBaseUrl: DEFAULT_API_BASE_URL,
  isLoadingPartners: false,
};

function byId(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element: ${id}`);
  }
  return node;
}

function t(key) {
  return I18N[state.lang][key] || I18N.en[key] || key;
}

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function firstAllowedDomain(partner) {
  if (!partner || typeof partner !== "object") {
    return undefined;
  }
  if (!Array.isArray(partner.allowedDomains) || partner.allowedDomains.length === 0) {
    return undefined;
  }
  return normalizeDomain(partner.allowedDomains[0]);
}

function extractBearerToken(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const withoutPrefix = raw.replace(/^Bearer\s+/i, "").trim();
  // Basic JWT shape validation: 3 dot-separated base64url chunks
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(withoutPrefix)) {
    return withoutPrefix;
  }
  return null;
}

function setStatus(message, type = "info") {
  const status = byId("status");
  status.className = "";
  if (type === "ok") status.classList.add("status-ok");
  if (type === "err") status.classList.add("status-err");
  status.textContent = message;
}

function setStatusFromKey(key, type = "info", extra = "") {
  const base = t(key);
  setStatus(extra ? `${base}: ${extra}` : base, type);
}

function findPartner(partners, slug) {
  return partners.find((partner) => partner.slug === slug) || null;
}

async function loadStorage() {
  return chrome.storage.sync.get([
    "enabled",
    "apiBaseUrl",
    "enabledPartnerSlugs",
    "partnerTokens",
    "popupLang",
  ]);
}

async function readCurrentPartnerState() {
  const current = await chrome.storage.sync.get([
    "enabledPartnerSlugs",
    "partnerTokens",
    "partnerSlug",
  ]);

  const enabledSet = new Set(
    Array.isArray(current.enabledPartnerSlugs) ? current.enabledPartnerSlugs : [],
  );
  const partnerTokens =
    current.partnerTokens && typeof current.partnerTokens === "object"
      ? current.partnerTokens
      : {};

  return {
    enabledSet,
    partnerTokens,
    fallbackSlug: current.partnerSlug || "",
  };
}

async function fetchPublicPartners(apiBaseUrl) {
  const response = await fetch(`${apiBaseUrl}/integrations/partners/public`);
  if (!response.ok) {
    throw new Error(`partners/public failed with ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((partner) => ({
      slug: String(partner.slug || "").trim(),
      name: String(partner.name || "").trim(),
      allowedDomains: Array.isArray(partner.allowedDomains)
        ? partner.allowedDomains.map((domain) => normalizeDomain(domain)).filter(Boolean)
        : [],
    }))
    .filter((partner) => partner.slug && partner.name);
}

function applyI18nTexts() {
  document.documentElement.lang = state.lang;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.dataset.i18n;
    if (!key) continue;
    node.textContent = t(key);
  }

  byId("connectCode").placeholder = t("connectCodePlaceholder");
  byId("langPt").classList.toggle("active", state.lang === "pt");
  byId("langEn").classList.toggle("active", state.lang === "en");
  updateExternalLinks();
}

function getLocalePath() {
  return state.lang === "pt" ? "pt" : "en";
}

function getSelectedConnectPartnerSlug() {
  return String(byId("connectPartnerSlug").value || "").trim();
}

function buildIntegrationsUrl() {
  const localePath = getLocalePath();
  const selectedSlug = getSelectedConnectPartnerSlug();
  const selectedPartner = findPartner(state.partners, selectedSlug);
  const sourceDomain = firstAllowedDomain(selectedPartner);

  const url = new URL(`${DEFAULT_FRONTEND_BASE_URL}/${localePath}/profile/integrations`);
  url.searchParams.set("mt_ext_connect", "1");
  if (chrome?.runtime?.id) {
    url.searchParams.set("mt_ext_id", chrome.runtime.id);
  }
  if (selectedSlug) {
    url.searchParams.set("mt_partner_slug", selectedSlug);
  }
  if (sourceDomain) {
    url.searchParams.set("mt_source_domain", sourceDomain);
  }
  if (state.apiBaseUrl) {
    url.searchParams.set("mt_api_base", state.apiBaseUrl);
  }

  return url.toString();
}

function updateExternalLinks() {
  const localePath = getLocalePath();
  byId("openIntegrations").href = buildIntegrationsUrl();
  byId("openSite").href = `${DEFAULT_FRONTEND_BASE_URL}/${localePath}`;
}

function setDiagnosticsValue(id, value) {
  byId(id).textContent = String(value ?? "-");
}

function formatTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return t("diagNever");
  }

  const date = new Date(numeric);
  if (!Number.isFinite(date.getTime())) {
    return t("diagUnknown");
  }

  const locale = state.lang === "pt" ? "pt-BR" : "en-US";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatNextRetry(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return t("diagNever");
  }

  const deltaMs = Math.max(0, numeric - Date.now());
  const totalSeconds = Math.ceil(deltaMs / 1000);
  return `${formatTimestamp(numeric)} (${totalSeconds}s)`;
}

function countConnectedPartners(partnerTokens) {
  if (!partnerTokens || typeof partnerTokens !== "object") {
    return 0;
  }

  return Object.values(partnerTokens).filter((value) => String(value || "").trim()).length;
}

function sendRuntimeMessage(message, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("runtime message timeout"));
    }, timeoutMs);

    chrome.runtime.sendMessage(message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

async function refreshDiagnostics({ showStatus = false } = {}) {
  try {
    const [storage, queueStats] = await Promise.all([
      chrome.storage.sync.get([
        "apiBaseUrl",
        "enabledPartnerSlugs",
        "partnerTokens",
      ]),
      sendRuntimeMessage({ type: "MANGA_SYNC_QUEUE_STATS" }),
    ]);

    const enabledPartnerSlugs = Array.isArray(storage.enabledPartnerSlugs)
      ? storage.enabledPartnerSlugs
      : [];
    const partnerTokens =
      storage.partnerTokens && typeof storage.partnerTokens === "object"
        ? storage.partnerTokens
        : {};

    const queueSize = Number(queueStats?.size);
    const dueCount = Number(queueStats?.dueCount);

    setDiagnosticsValue("diagQueueSize", Number.isFinite(queueSize) ? queueSize : 0);
    setDiagnosticsValue("diagDueCount", Number.isFinite(dueCount) ? dueCount : 0);
    setDiagnosticsValue("diagNextRetry", formatNextRetry(queueStats?.nextAttemptAt));
    setDiagnosticsValue("diagEnabledPartners", enabledPartnerSlugs.length);
    setDiagnosticsValue("diagConnectedPartners", countConnectedPartners(partnerTokens));
    setDiagnosticsValue("diagLastUpdate", formatTimestamp(Date.now()));
    setDiagnosticsValue(
      "diagApiBase",
      normalizeUrl(storage.apiBaseUrl || state.apiBaseUrl || DEFAULT_API_BASE_URL),
    );

    if (showStatus) {
      setStatusFromKey("statusDiagnosticsLoaded", "ok");
    }
  } catch (error) {
    setDiagnosticsValue("diagQueueSize", t("diagUnknown"));
    setDiagnosticsValue("diagDueCount", t("diagUnknown"));
    setDiagnosticsValue("diagNextRetry", t("diagUnknown"));
    setDiagnosticsValue("diagLastUpdate", formatTimestamp(Date.now()));

    if (showStatus) {
      setStatusFromKey(
        "statusDiagnosticsLoadError",
        "err",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }
}

async function drainQueueNow() {
  try {
    await sendRuntimeMessage({ type: "MANGA_SYNC_QUEUE_DRAIN" });
    setStatusFromKey("statusDiagnosticsDrainOk", "ok");
  } catch (error) {
    setStatusFromKey(
      "statusDiagnosticsDrainError",
      "err",
      error instanceof Error ? error.message : "unknown",
    );
  }

  await refreshDiagnostics({ showStatus: false });
}

function renderPartners(partners, enabledSet, partnerTokens) {
  const list = byId("partnersList");
  list.innerHTML = "";

  if (state.isLoadingPartners) {
    const node = document.createElement("div");
    node.className = "partner-item";
    node.textContent = t("loadingPartners");
    list.appendChild(node);
    return;
  }

  if (partners.length === 0) {
    const node = document.createElement("div");
    node.className = "partner-item";
    node.textContent = t("noPartners");
    list.appendChild(node);
    return;
  }

  for (const partner of partners) {
    const item = document.createElement("div");
    item.className = "partner-item";

    const label = document.createElement("label");
    label.className = "partner-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = enabledSet.has(partner.slug);
    checkbox.dataset.partnerSlug = partner.slug;

    const title = document.createElement("span");
    title.textContent = partner.name;
    label.appendChild(checkbox);
    label.appendChild(title);

    const chip = document.createElement("span");
    const connected = Boolean(partnerTokens[partner.slug]);
    chip.className = connected ? "status-chip" : "status-chip off";
    chip.textContent = connected ? t("connected") : t("notConnected");

    const head = document.createElement("div");
    head.className = "partner-head";
    head.appendChild(label);
    head.appendChild(chip);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = `${t("slug")}: ${partner.slug}`;

    item.appendChild(head);
    item.appendChild(hint);
    list.appendChild(item);
  }
}

function renderConnectSelect(partners, enabledSet, fallbackSlug) {
  const row = byId("connectPartnerRow");
  const select = byId("connectPartnerSlug");
  select.innerHTML = "";

  const selectable = partners.filter((partner) => enabledSet.has(partner.slug));
  const source = selectable.length > 0 ? selectable : partners;
  row.classList.toggle("hidden", source.length <= 1);

  for (const partner of source) {
    const option = document.createElement("option");
    option.value = partner.slug;
    option.textContent = `${partner.name} (${partner.slug})`;
    select.appendChild(option);
  }

  if (fallbackSlug) {
    select.value = fallbackSlug;
  } else if (source[0]) {
    select.value = source[0].slug;
  }

  updateExternalLinks();
}

function buildLegacyCompatibility(partners, enabledPartnerSlugs, partnerTokens) {
  for (const slug of enabledPartnerSlugs) {
    const partner = findPartner(partners, slug);
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

  return {
    partnerSlug: "",
    accessToken: "",
    allowedDomains: [],
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

async function persistState(partners = state.partners) {
  const enabled = byId("enabled").checked;

  const checkboxes = Array.from(document.querySelectorAll("input[data-partner-slug]"));
  const enabledPartnerSlugs = checkboxes
    .filter((input) => input.checked)
    .map((input) => input.dataset.partnerSlug)
    .filter(Boolean);

  const current = await chrome.storage.sync.get(["partnerTokens"]);
  const partnerTokens = current.partnerTokens && typeof current.partnerTokens === "object"
    ? current.partnerTokens
    : {};

  const legacy = buildLegacyCompatibility(partners, enabledPartnerSlugs, partnerTokens);
  const partnerDomainsMap = buildPartnerDomainsMap(partners);

  await chrome.storage.sync.set({
    enabled,
    apiBaseUrl: state.apiBaseUrl,
    enabledPartnerSlugs,
    partnerDomainsMap,
    partnerTokens,
    popupLang: state.lang,
    ...legacy,
  });

  await refreshDiagnostics({ showStatus: false });
  return { enabledPartnerSlugs, partnerTokens };
}

async function connectAccount(partners = state.partners) {
  const partnerSlug = byId("connectPartnerSlug").value.trim();
  const partner = findPartner(partners, partnerSlug);
  if (!partner) {
    setStatusFromKey("statusSelectPartner", "err");
    return;
  }

  const connectCodeOrToken = byId("connectCode").value.trim();
  if (!connectCodeOrToken) {
    const connectUrl = buildIntegrationsUrl();
    try {
      if (chrome?.tabs?.create) {
        await chrome.tabs.create({ url: connectUrl });
      } else {
        window.open(connectUrl, "_blank", "noopener,noreferrer");
      }
      setStatusFromKey("statusOpenConnectFlow", "ok");
    } catch (error) {
      setStatusFromKey(
        "statusConnectError",
        "err",
        error instanceof Error ? error.message : "failed to open connect flow",
      );
    }
    return;
  }

  const saved = await persistState(partners);
  const directToken = extractBearerToken(connectCodeOrToken);
  if (directToken) {
    const nextTokens = {
      ...(saved.partnerTokens || {}),
      [partnerSlug]: directToken,
    };
    const enabledSet = new Set(saved.enabledPartnerSlugs);
    enabledSet.add(partnerSlug);
    const enabledPartnerSlugs = Array.from(enabledSet);
    const legacy = buildLegacyCompatibility(partners, enabledPartnerSlugs, nextTokens);

    await chrome.storage.sync.set({
      enabled: true,
      enabledPartnerSlugs,
      partnerTokens: nextTokens,
      popupLang: state.lang,
      ...legacy,
    });

    byId("enabled").checked = true;
    byId("connectCode").value = "";
    renderPartners(partners, enabledSet, nextTokens);
    renderConnectSelect(partners, enabledSet, partnerSlug);
    setStatusFromKey("statusConnected", "ok");
    await refreshDiagnostics({ showStatus: false });
    return;
  }

  const sourceDomain = firstAllowedDomain(partner);
  setStatusFromKey("statusConnecting");

  try {
    const response = await fetch(`${state.apiBaseUrl}/integrations/connect/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        partnerSlug,
        code: connectCodeOrToken,
        sourceDomain,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      setStatusFromKey("statusExchangeFail", "err", `${response.status} ${text}`);
      return;
    }

    const data = await response.json();
    if (!data.accessToken) {
      setStatusFromKey("statusNoToken", "err");
      return;
    }

    const nextTokens = {
      ...(saved.partnerTokens || {}),
      [partnerSlug]: data.accessToken,
    };

    const enabledSet = new Set(saved.enabledPartnerSlugs);
    enabledSet.add(partnerSlug);
    const enabledPartnerSlugs = Array.from(enabledSet);
    const legacy = buildLegacyCompatibility(partners, enabledPartnerSlugs, nextTokens);

    await chrome.storage.sync.set({
      enabled: true,
      enabledPartnerSlugs,
      partnerTokens: nextTokens,
      popupLang: state.lang,
      ...legacy,
    });

    byId("enabled").checked = true;
    byId("connectCode").value = "";
    renderPartners(partners, enabledSet, nextTokens);
    renderConnectSelect(partners, enabledSet, partnerSlug);
    setStatusFromKey("statusConnected", "ok");
    await refreshDiagnostics({ showStatus: false });
  } catch (error) {
    setStatusFromKey(
      "statusConnectError",
      "err",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

async function disconnectSelectedPartner(partners = state.partners) {
  const slug = byId("connectPartnerSlug").value.trim();
  if (!slug) {
    setStatusFromKey("statusSelectDisconnect", "err");
    return;
  }

  const current = await chrome.storage.sync.get(["enabledPartnerSlugs", "partnerTokens"]);
  const enabledSet = new Set(
    Array.isArray(current.enabledPartnerSlugs) ? current.enabledPartnerSlugs : [],
  );
  const partnerTokens =
    current.partnerTokens && typeof current.partnerTokens === "object"
      ? { ...current.partnerTokens }
      : {};

  enabledSet.delete(slug);
  delete partnerTokens[slug];

  const enabledPartnerSlugs = Array.from(enabledSet);
  const legacy = buildLegacyCompatibility(partners, enabledPartnerSlugs, partnerTokens);
  await chrome.storage.sync.set({
    enabledPartnerSlugs,
    partnerTokens,
    popupLang: state.lang,
    ...legacy,
  });

  renderPartners(partners, enabledSet, partnerTokens);
  renderConnectSelect(partners, enabledSet, enabledPartnerSlugs[0] || "");
  setStatusFromKey("statusDisconnected", "ok");
  await refreshDiagnostics({ showStatus: false });
}

async function setLanguage(lang) {
  state.lang = lang === "pt" ? "pt" : "en";
  const { enabledSet, partnerTokens, fallbackSlug } = await readCurrentPartnerState();
  applyI18nTexts();
  renderPartners(state.partners, enabledSet, partnerTokens);
  renderConnectSelect(state.partners, enabledSet, fallbackSlug);
  await refreshDiagnostics({ showStatus: false });
  await chrome.storage.sync.set({ popupLang: state.lang });
}

async function refreshPartnersInBackground() {
  state.isLoadingPartners = true;
  try {
    const preState = await readCurrentPartnerState();
    renderPartners(state.partners, preState.enabledSet, preState.partnerTokens);

    const partners = await fetchPublicPartners(state.apiBaseUrl);
    state.partners = partners;
  } catch {
    state.partners = [];
  } finally {
    state.isLoadingPartners = false;
    const currentState = await readCurrentPartnerState();
    renderPartners(state.partners, currentState.enabledSet, currentState.partnerTokens);
    renderConnectSelect(state.partners, currentState.enabledSet, currentState.fallbackSlug);
  }
}

async function init() {
  const saved = await loadStorage();
  state.lang = saved.popupLang === "pt" ? "pt" : "en";
  state.apiBaseUrl = normalizeUrl(saved.apiBaseUrl || DEFAULT_API_BASE_URL);

  byId("enabled").checked = Boolean(saved.enabled);

  const enabledSet = new Set(
    Array.isArray(saved.enabledPartnerSlugs) ? saved.enabledPartnerSlugs : [],
  );
  const partnerTokens =
    saved.partnerTokens && typeof saved.partnerTokens === "object"
      ? saved.partnerTokens
      : {};

  state.partners = [];
  state.isLoadingPartners = true;

  applyI18nTexts();
  renderPartners(state.partners, enabledSet, partnerTokens);
  renderConnectSelect(state.partners, enabledSet, saved.partnerSlug || "");

  byId("enabled").addEventListener("change", async () => {
    await persistState();
    setStatusFromKey("statusSaved", "ok");
  });

  byId("partnersList").addEventListener("change", async () => {
    const updated = await persistState();
    const nextEnabledSet = new Set(updated.enabledPartnerSlugs);
    renderConnectSelect(state.partners, nextEnabledSet, byId("connectPartnerSlug").value);
    setStatusFromKey("statusPartnerSelectionSaved", "ok");
  });

  byId("connectPartnerSlug").addEventListener("change", () => {
    updateExternalLinks();
  });

  byId("connectBtn").addEventListener("click", () => {
    void connectAccount();
  });

  byId("disconnectBtn").addEventListener("click", () => {
    void disconnectSelectedPartner();
  });

  byId("langPt").addEventListener("click", () => {
    void setLanguage("pt");
  });

  byId("langEn").addEventListener("click", () => {
    void setLanguage("en");
  });

  byId("refreshDiagBtn").addEventListener("click", () => {
    void refreshDiagnostics({ showStatus: true });
  });

  byId("drainQueueBtn").addEventListener("click", () => {
    void drainQueueNow();
  });

  void refreshPartnersInBackground();
  void refreshDiagnostics({ showStatus: false });
}

void init();
