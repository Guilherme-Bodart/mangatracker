const MAX_CHAPTER_VALUE = 100000;
const KNOWN_PARSER_MODES = new Set([
  "generic",
  "mangalivre",
  "seriesSlugNumberPath",
  "singleSlugNumberPath",
]);

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTextForMatching(value) {
  return normalizeWhitespace(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
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
    .map((value) => normalizeWhitespace(value))
    .filter(Boolean);
}

function normalizePartnerConfig(config) {
  if (!config || typeof config !== "object") {
    return {
      parserMode: null,
      parserTitleSelectors: [],
      parserChapterSelectors: [],
    };
  }

  return {
    parserMode: normalizeParserMode(config.parserMode),
    parserTitleSelectors: normalizeSelectorList(config.parserTitleSelectors),
    parserChapterSelectors: normalizeSelectorList(config.parserChapterSelectors),
  };
}

function normalizeChapterNumber(value) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_CHAPTER_VALUE) {
    return null;
  }
  return parsed;
}

function parseChapterFromText(value, options = {}) {
  if (!value) return null;

  const allowPlainNumber = Boolean(options.allowPlainNumber);
  const normalized = normalizeTextForMatching(value);
  if (!normalized) return null;

  const keywordMatch = normalized.match(
    /(?:\bcap(?:itulo)?\b|\bchapter\b|\bch\b\.?)[^\d]{0,12}(\d{1,5})(?:[.,]\d+)?/i,
  );
  if (keywordMatch?.[1]) {
    return normalizeChapterNumber(keywordMatch[1]);
  }

  const inlineMatch = normalized.match(
    /\b(?:cap(?:itulo)?|chapter|ch)[-_ ]?(\d{1,5})(?:[.,]\d+)?\b/i,
  );
  if (inlineMatch?.[1]) {
    return normalizeChapterNumber(inlineMatch[1]);
  }

  if (allowPlainNumber) {
    const plainNumber = normalized.match(/^(\d{1,5})(?:[.,]\d+)?$/);
    if (plainNumber?.[1]) {
      return normalizeChapterNumber(plainNumber[1]);
    }
  }

  return null;
}

function parseChapterFromPath(pathname) {
  const normalizedPath = normalizeTextForMatching(pathname).replace(/[\/_-]+/g, " ");
  if (!normalizedPath) {
    return null;
  }

  return parseChapterFromText(normalizedPath, { allowPlainNumber: false });
}

function computeTokenJaccard(left, right) {
  const leftTokens = new Set(normalizeTextForMatching(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeTextForMatching(right).split(" ").filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function isLikelySameMangaTitle(left, right) {
  const normalizedLeft = normalizeTextForMatching(left);
  const normalizedRight = normalizeTextForMatching(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return true;
  }

  return computeTokenJaccard(normalizedLeft, normalizedRight) >= 0.5;
}

function slugify(value) {
  return normalizeTextForMatching(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleizeSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function sanitizeMangaTitle(title) {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return "";

  return normalized
    .replace(/^(?:cap.{0,3}tulo|chapter|ch\.?)\s+\d+(?:[.,]\d+)?\s*[-|:]\s*/i, "")
    .replace(/\s*[-|:]\s*cap.{0,3}tulo\s+\d+.*$/i, "")
    .replace(/\s*[-|:]\s*chapter\s+\d+.*$/i, "")
    .replace(/\s*[-|:]\s*ch\.?\s*\d+.*$/i, "")
    .replace(/\s*[-|:]\s*manga\s*livre.*$/i, "")
    .replace(/\s+\|\s+[^|]+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readNodeText(node) {
  if (!node) return "";

  if (typeof node === "string") {
    return normalizeWhitespace(node);
  }

  const content =
    (typeof node.getAttribute === "function" && node.getAttribute("content")) ||
    node.content ||
    node.textContent ||
    "";

  return normalizeWhitespace(content);
}

function pickFirstNonEmpty(values) {
  for (const value of values) {
    if (value) {
      return value;
    }
  }
  return "";
}

function collectRawTitleCandidates(documentRef, extraSelectors = []) {
  const selectors = [
    "meta[property='og:title']",
    "meta[name='twitter:title']",
    "h1",
    "main h1",
    "article h1",
    ...extraSelectors,
  ];

  return [
    ...selectors.map((selector) => readNodeText(documentRef?.querySelector?.(selector))),
    normalizeWhitespace(documentRef?.title),
  ].filter(Boolean);
}

function collectTextBySelectors(documentRef, selectors, allowPlainNumber = false) {
  return normalizeSelectorList(selectors).map((selector) => ({
    value: readNodeText(documentRef?.querySelector?.(selector)),
    allowPlainNumber,
  }));
}

function findChapterFromHints(hints) {
  for (const hint of hints) {
    const chapter = parseChapterFromText(hint.value, {
      allowPlainNumber: hint.allowPlainNumber,
    });
    if (chapter !== null) {
      return chapter;
    }
  }

  return null;
}

function deriveExternalMangaId(pathname, title) {
  const reserved = new Set([
    "manga",
    "mangas",
    "chapter",
    "chapters",
    "capitulo",
    "capitulos",
    "read",
    "reader",
    "leitura",
    "ler",
  ]);

  const cleanedSegments = String(pathname || "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => slugify(segment))
    .map((segment) =>
      segment
        .replace(/(?:-|_)(?:cap(?:itulo)?|chapter|ch)(?:-|_)?\d+.*$/i, "")
        .replace(/(?:^|-)cap(?:itulo)?-\d+.*$/i, "")
        .replace(/^(?:cap(?:itulo)?|chapter|ch)(?:-|_)?\d+.*$/i, ""),
    )
    .map((segment) => segment.replace(/^-+|-+$/g, ""))
    .filter((segment) => segment && !reserved.has(segment) && !/^\d+$/.test(segment));

  if (cleanedSegments.length > 0) {
    return cleanedSegments.slice(0, 2).join("-");
  }

  return slugify(title) || "unknown-manga";
}

function parseSeriesSlugNumberPath(documentRef, locationRef, options = {}) {
  const match = String(locationRef?.pathname || "").match(/^\/series\/([^/]+)\/(\d+)\/?$/i);
  if (!match) {
    return null;
  }

  const mangaSlug = slugify(match[1]);
  const chapter = normalizeChapterNumber(match[2]);
  if (!mangaSlug || chapter === null) {
    return null;
  }

  const rawTitleCandidates = collectRawTitleCandidates(
    documentRef,
    options.parserTitleSelectors,
  );
  const title =
    pickFirstNonEmpty(rawTitleCandidates.map((value) => sanitizeMangaTitle(value))) ||
    titleizeSlug(mangaSlug);
  if (!title) {
    return null;
  }

  return {
    title,
    chapter,
    externalMangaId: mangaSlug,
    sourceDomain: normalizeHostname(locationRef?.hostname),
  };
}

function parseSingleSlugNumberPath(documentRef, locationRef, options = {}) {
  const match = String(locationRef?.pathname || "").match(/^\/([^/]+)\/(\d+)\/?$/i);
  if (!match) {
    return null;
  }

  const mangaSlug = slugify(match[1]);
  const chapter = normalizeChapterNumber(match[2]);
  if (!mangaSlug || chapter === null) {
    return null;
  }

  const rawTitleCandidates = collectRawTitleCandidates(
    documentRef,
    options.parserTitleSelectors,
  );
  const title =
    pickFirstNonEmpty(rawTitleCandidates.map((value) => sanitizeMangaTitle(value))) ||
    titleizeSlug(mangaSlug);
  if (!title) {
    return null;
  }

  return {
    title,
    chapter,
    externalMangaId: mangaSlug,
    sourceDomain: normalizeHostname(locationRef?.hostname),
  };
}

function parseMangaLivre(documentRef, locationRef, options = {}) {
  const match = String(locationRef?.pathname || "").match(
    /^\/manga\/([^/]+)\/capitulo-(\d+)\/?$/i,
  );
  if (!match) {
    return null;
  }

  const mangaSlug = slugify(match[1]);
  const chapter = normalizeChapterNumber(match[2]);
  if (!mangaSlug || chapter === null) {
    return null;
  }

  const slugTitle = titleizeSlug(mangaSlug);

  const trustedCandidates = collectRawTitleCandidates(
    documentRef,
    options.parserTitleSelectors,
  )
    .map((value) => sanitizeMangaTitle(value))
    .filter((candidate) => isLikelySameMangaTitle(candidate, slugTitle));

  const title = trustedCandidates[0] || slugTitle;
  if (!title) {
    return null;
  }

  return {
    title,
    chapter,
    externalMangaId: mangaSlug,
    sourceDomain: normalizeHostname(locationRef?.hostname),
  };
}

function parseGeneric(documentRef, locationRef, options = {}) {
  const normalizedOptions = normalizePartnerConfig(options);
  const rawTitleCandidates = collectRawTitleCandidates(
    documentRef,
    normalizedOptions.parserTitleSelectors,
  );
  const titleCandidates = rawTitleCandidates
    .map((value) => sanitizeMangaTitle(value))
    .filter(Boolean);

  const title = titleCandidates[0];
  if (!title) {
    return null;
  }

  const chapterFromPath = parseChapterFromPath(locationRef?.pathname || "/");

  const chapterHints = [
    {
      value: readNodeText(documentRef?.querySelector?.("meta[name='chapter']")),
      allowPlainNumber: true,
    },
    {
      value: normalizeWhitespace(
        documentRef?.querySelector?.("[data-chapter]")?.getAttribute?.("data-chapter"),
      ),
      allowPlainNumber: true,
    },
    {
      value: readNodeText(documentRef?.querySelector?.(".chapter")),
      allowPlainNumber: false,
    },
    {
      value: readNodeText(documentRef?.querySelector?.("[class*='chapter' i]")),
      allowPlainNumber: false,
    },
    {
      value: readNodeText(documentRef?.querySelector?.("[id*='chapter' i]")),
      allowPlainNumber: false,
    },
    ...collectTextBySelectors(
      documentRef,
      normalizedOptions.parserChapterSelectors,
      true,
    ),
    ...rawTitleCandidates.map((value) => ({
      value,
      allowPlainNumber: false,
    })),
  ];

  let chapter = chapterFromPath;
  if (chapter === null) {
    chapter = findChapterFromHints(chapterHints);
  }

  if (chapter === null) {
    return null;
  }

  return {
    title,
    chapter,
    externalMangaId: deriveExternalMangaId(locationRef?.pathname || "/", title),
    sourceDomain: normalizeHostname(locationRef?.hostname),
  };
}

function inferParserModeFromHostname(hostname) {
  if (hostname === "mangalivre.tv" || hostname.endsWith(".mangalivre.tv")) {
    return "mangalivre";
  }

  if (hostname === "lycantoons.com" || hostname.endsWith(".lycantoons.com")) {
    return "seriesSlugNumberPath";
  }

  if (hostname === "toonlivre.net" || hostname.endsWith(".toonlivre.net")) {
    return "singleSlugNumberPath";
  }

  return "generic";
}

function detectMangaPayload(documentRef, locationRef, partnerConfig) {
  const protocol = String(locationRef?.protocol || "").toLowerCase();
  if (protocol && protocol !== "https:" && protocol !== "http:") {
    return null;
  }

  const hostname = normalizeHostname(locationRef?.hostname);
  if (!hostname) {
    return null;
  }

  const normalizedConfig = normalizePartnerConfig(partnerConfig);
  const parserMode =
    normalizedConfig.parserMode || inferParserModeFromHostname(hostname);

  if (parserMode === "mangalivre") {
    return (
      parseMangaLivre(documentRef, locationRef, normalizedConfig) ||
      parseGeneric(documentRef, locationRef, normalizedConfig)
    );
  }

  if (parserMode === "seriesSlugNumberPath") {
    return (
      parseSeriesSlugNumberPath(documentRef, locationRef, normalizedConfig) ||
      parseGeneric(documentRef, locationRef, normalizedConfig)
    );
  }

  if (parserMode === "singleSlugNumberPath") {
    return (
      parseSingleSlugNumberPath(documentRef, locationRef, normalizedConfig) ||
      parseGeneric(documentRef, locationRef, normalizedConfig)
    );
  }

  return parseGeneric(documentRef, locationRef, normalizedConfig);
}

const exportedAdapters = {
  parseChapterFromText,
  sanitizeMangaTitle,
  parseMangaLivre,
  parseSeriesSlugNumberPath,
  parseSingleSlugNumberPath,
  parseGeneric,
  detectMangaPayload,
};

globalThis.detectMangaPayload = detectMangaPayload;
if (typeof module !== "undefined" && module.exports) {
  module.exports = exportedAdapters;
}
