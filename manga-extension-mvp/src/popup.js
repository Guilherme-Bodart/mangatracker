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
    connected: "Connected",
    notConnected: "Not connected",
    slug: "Slug",
    statusEnterCode: "Enter a connect code.",
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
  },
  pt: {
    subtitle: "Escolha os sites que podem sincronizar leitura.",
    extensionActive: "Extensao ativa",
    partnerToConnect: "Parceiro para conectar",
    connectCode: "Código de conexão",
    connectCodePlaceholder: "Cole código de conexão",
    connectAccount: "Conectar conta",
    disconnect: "Desconectar",
    openIntegrations: "Abrir Integrations",
    openSite: "Abrir Manga Tracker",
    noPartners: "Nenhum parceiro ativo disponivel.",
    connected: "Conectado",
    notConnected: "Nao conectado",
    slug: "Slug",
    statusEnterCode: "Informe o código de conexão.",
    statusSelectPartner: "Selecione um parceiro valido.",
    statusConnecting: "Conectando conta...",
    statusExchangeFail: "Falha na conexao",
    statusNoToken: "Resposta sem accessToken.",
    statusConnected: "Conta conectada com sucesso.",
    statusConnectError: "Erro na conexao",
    statusSelectDisconnect: "Selecione um parceiro para desconectar.",
    statusDisconnected: "Parceiro desconectado.",
    statusSaved: "Configuracoes salvas.",
    statusPartnerSelectionSaved: "Selecao de sites atualizada.",
  },
};

const state = {
  lang: "en",
  partners: [],
  apiBaseUrl: DEFAULT_API_BASE_URL,
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

  const localePath = state.lang === "pt" ? "pt" : "en";
  byId("openIntegrations").href = `${DEFAULT_FRONTEND_BASE_URL}/${localePath}/profile/integrations`;
  byId("openSite").href = `${DEFAULT_FRONTEND_BASE_URL}/${localePath}`;
}

function renderPartners(partners, enabledSet, partnerTokens) {
  const list = byId("partnersList");
  list.innerHTML = "";

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

async function persistState(partners) {
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

  return { enabledPartnerSlugs, partnerTokens };
}

async function connectAccount(partners) {
  const connectCodeOrToken = byId("connectCode").value.trim();
  if (!connectCodeOrToken) {
    setStatusFromKey("statusEnterCode", "err");
    return;
  }

  const partnerSlug = byId("connectPartnerSlug").value.trim();
  const partner = findPartner(partners, partnerSlug);
  if (!partner) {
    setStatusFromKey("statusSelectPartner", "err");
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
  } catch (error) {
    setStatusFromKey(
      "statusConnectError",
      "err",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

async function disconnectSelectedPartner(partners) {
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
}

async function setLanguage(lang) {
  state.lang = lang === "pt" ? "pt" : "en";
  const current = await chrome.storage.sync.get(["enabledPartnerSlugs", "partnerTokens", "partnerSlug"]);
  const enabledSet = new Set(
    Array.isArray(current.enabledPartnerSlugs) ? current.enabledPartnerSlugs : [],
  );
  const partnerTokens =
    current.partnerTokens && typeof current.partnerTokens === "object"
      ? current.partnerTokens
      : {};
  const fallbackSlug = current.partnerSlug || "";
  applyI18nTexts();
  renderPartners(state.partners, enabledSet, partnerTokens);
  renderConnectSelect(state.partners, enabledSet, fallbackSlug);
  await chrome.storage.sync.set({ popupLang: state.lang });
}

async function init() {
  const saved = await loadStorage();
  state.lang = saved.popupLang === "pt" ? "pt" : "en";
  state.apiBaseUrl = normalizeUrl(saved.apiBaseUrl || DEFAULT_API_BASE_URL);

  byId("enabled").checked = Boolean(saved.enabled);

  let partners = [];
  try {
    partners = await fetchPublicPartners(state.apiBaseUrl);
  } catch {
    partners = [];
  }
  state.partners = partners;

  const enabledSet = new Set(
    Array.isArray(saved.enabledPartnerSlugs) ? saved.enabledPartnerSlugs : [],
  );
  const partnerTokens =
    saved.partnerTokens && typeof saved.partnerTokens === "object"
      ? saved.partnerTokens
      : {};

  applyI18nTexts();
  renderPartners(partners, enabledSet, partnerTokens);
  renderConnectSelect(partners, enabledSet, saved.partnerSlug || "");

  byId("enabled").addEventListener("change", async () => {
    await persistState(partners);
    setStatusFromKey("statusSaved", "ok");
  });

  byId("partnersList").addEventListener("change", async () => {
    const updated = await persistState(partners);
    const nextEnabledSet = new Set(updated.enabledPartnerSlugs);
    renderConnectSelect(partners, nextEnabledSet, byId("connectPartnerSlug").value);
    setStatusFromKey("statusPartnerSelectionSaved", "ok");
  });

  byId("connectBtn").addEventListener("click", () => {
    void connectAccount(partners);
  });

  byId("disconnectBtn").addEventListener("click", () => {
    void disconnectSelectedPartner(partners);
  });

  byId("langPt").addEventListener("click", () => {
    void setLanguage("pt");
  });

  byId("langEn").addEventListener("click", () => {
    void setLanguage("en");
  });
}

void init();
