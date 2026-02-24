const DEFAULT_API_BASE_URL = "http://localhost:3001";

function byId(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing element: ${id}`);
  }
  return node;
}

async function load() {
  const data = await chrome.storage.sync.get([
    "enabled",
    "apiBaseUrl",
    "partnerSlug",
    "accessToken",
    "allowedDomains",
  ]);

  byId("enabled").checked = Boolean(data.enabled);
  byId("apiBaseUrl").value = data.apiBaseUrl || DEFAULT_API_BASE_URL;
  byId("partnerSlug").value = data.partnerSlug || "";
  byId("accessToken").value = data.accessToken || "";
  byId("allowedDomains").value = Array.isArray(data.allowedDomains)
    ? data.allowedDomains.join("\n")
    : "";
  byId("sourceDomain").value = (Array.isArray(data.allowedDomains) && data.allowedDomains[0]) || "";
}

async function save() {
  const enabled = byId("enabled").checked;
  const apiBaseUrl = (byId("apiBaseUrl").value.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const partnerSlug = byId("partnerSlug").value.trim();
  const accessToken = byId("accessToken").value.trim();
  const allowedDomains = byId("allowedDomains")
    .value.split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);

  await chrome.storage.sync.set({
    enabled,
    apiBaseUrl,
    partnerSlug,
    accessToken,
    allowedDomains,
  });

  const status = byId("status");
  status.textContent = "Configurações salvas.";
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

async function exchangeCode() {
  const apiBaseUrl = (byId("apiBaseUrl").value.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const partnerSlug = byId("partnerSlug").value.trim();
  const connectCode = byId("connectCode").value.trim();
  const clientSecret = byId("clientSecret").value.trim();
  const sourceDomain = byId("sourceDomain").value.trim();
  const status = byId("status");

  if (!apiBaseUrl || !partnerSlug || !connectCode || !clientSecret) {
    status.textContent = "Preencha URL da API, slug do parceiro, código e client secret.";
    return;
  }

  status.textContent = "Trocando código...";
  try {
    const response = await fetch(`${apiBaseUrl}/integrations/connect/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        partnerSlug,
        clientSecret,
        code: connectCode,
        sourceDomain: sourceDomain || undefined,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      status.textContent = `Falha ao trocar código (${response.status}): ${text}`;
      return;
    }

    const data = await response.json();
    if (!data.accessToken) {
      status.textContent = "Resposta sem accessToken.";
      return;
    }

    byId("accessToken").value = data.accessToken;
    await chrome.storage.sync.set({
      accessToken: data.accessToken,
    });
    status.textContent = "Token atualizado com sucesso.";
  } catch (error) {
    status.textContent = `Erro na troca: ${error instanceof Error ? error.message : "desconhecido"}`;
  }
}

byId("saveBtn").addEventListener("click", () => {
  void save();
});
byId("exchangeBtn").addEventListener("click", () => {
  void exchangeCode();
});

void load();
