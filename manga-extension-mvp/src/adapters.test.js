const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseChapterFromText,
  sanitizeMangaTitle,
  parseMangaLivre,
  parseSeriesSlugNumberPath,
  parseSingleSlugNumberPath,
  parseGeneric,
  detectMangaPayload,
} = require("./adapters.js");

function createNode({ content, textContent, dataChapter } = {}) {
  return {
    content: content ?? null,
    textContent: textContent ?? content ?? null,
    getAttribute(name) {
      if (name === "content") return content ?? null;
      if (name === "data-chapter") return dataChapter ?? null;
      return null;
    },
  };
}

function createDocument({ title = "", selectors = {}, bodyText = "" } = {}) {
  return {
    title,
    querySelector(selector) {
      return Object.prototype.hasOwnProperty.call(selectors, selector)
        ? selectors[selector]
        : null;
    },
    body: bodyText ? { textContent: bodyText } : null,
  };
}

test("parseChapterFromText reads chapter labels and plain numbers", () => {
  assert.equal(parseChapterFromText("Chapter 123"), 123);
  assert.equal(parseChapterFromText("Capitulo-45"), 45);
  assert.equal(parseChapterFromText("89", { allowPlainNumber: true }), 89);
});

test("parseChapterFromText avoids false positive on generic numbers", () => {
  assert.equal(parseChapterFromText("One Piece 2026 release"), null);
  assert.equal(parseChapterFromText("One Piece 2026 release", { allowPlainNumber: true }), null);
});

test("sanitizeMangaTitle strips chapter suffix", () => {
  assert.equal(sanitizeMangaTitle("One Piece - Chapter 1123"), "One Piece");
  assert.equal(sanitizeMangaTitle("Naruto - Ch. 700"), "Naruto");
  assert.equal(
    sanitizeMangaTitle("Capítulo 259 - Providência de Alto Nível | Pluma Comics"),
    "Providência de Alto Nível",
  );
});

test("parseMangaLivre returns stable payload", () => {
  const documentRef = createDocument({
    title: "Unused",
    selectors: {
      "meta[property='og:title']": createNode({
        content: "One Piece - Capitulo 123",
      }),
      h1: createNode({ textContent: "One Piece" }),
    },
  });

  const payload = parseMangaLivre(documentRef, {
    hostname: "www.mangalivre.tv",
    pathname: "/manga/one-piece/capitulo-123/",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "One Piece",
    chapter: 123,
    externalMangaId: "one-piece",
    sourceDomain: "mangalivre.tv",
  });
});

test("parseMangaLivre ignores mismatched metadata and trusts slug", () => {
  const documentRef = createDocument({
    title: "Magic - Capitulo 833",
    selectors: {
      "meta[property='og:title']": createNode({
        content: "Magic - Capitulo 833",
      }),
      h1: createNode({ textContent: "Magic" }),
    },
  });

  const payload = parseMangaLivre(documentRef, {
    hostname: "mangalivre.tv",
    pathname: "/manga/the-devil-butler/capitulo-833/",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "The Devil Butler",
    chapter: 833,
    externalMangaId: "the-devil-butler",
    sourceDomain: "mangalivre.tv",
  });
});

test("parseGeneric extracts chapter from path when hints are missing", () => {
  const documentRef = createDocument({
    title: "My Hero Academia",
  });

  const payload = parseGeneric(documentRef, {
    hostname: "reader.example.com",
    pathname: "/manga/my-hero-academia/chapter-407",
    protocol: "https:",
  });

  assert.equal(payload?.title, "My Hero Academia");
  assert.equal(payload?.chapter, 407);
  assert.equal(payload?.externalMangaId, "my-hero-academia");
});

test("parseGeneric accepts extra selectors from partner config", () => {
  const documentRef = createDocument({
    selectors: {
      ".post-title": createNode({ textContent: "Legendary Surgeon" }),
      ".reader-current": createNode({ textContent: "Chapter 190" }),
    },
  });

  const payload = parseGeneric(
    documentRef,
    {
      hostname: "dynamic.example.com",
      pathname: "/read/legendary-surgeon",
      protocol: "https:",
    },
    {
      parserTitleSelectors: [".post-title"],
      parserChapterSelectors: [".reader-current"],
    },
  );

  assert.deepEqual(payload, {
    title: "Legendary Surgeon",
    chapter: 190,
    externalMangaId: "legendary-surgeon",
    sourceDomain: "dynamic.example.com",
  });
});

test("parseGeneric handles Manga Online title and chapter path", () => {
  const documentRef = createDocument({
    title: "The Infinite Mage - capítulo 166 (PT-BR)",
    selectors: {
      "meta[property='og:title']": createNode({
        content: "The Infinite Mage",
      }),
    },
  });

  const payload = parseGeneric(documentRef, {
    hostname: "mangaonline.red",
    pathname: "/manga/the-infinite-mage/capitulo-166-pt-br/",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "The Infinite Mage",
    chapter: 166,
    externalMangaId: "the-infinite-mage",
    sourceDomain: "mangaonline.red",
  });
});

test("parseGeneric handles MangaLivre.blog chapter slug pages", () => {
  const documentRef = createDocument({
    title: "The Infinite Mage - Capítulo 166",
  });

  const payload = parseGeneric(documentRef, {
    hostname: "mangalivre.blog",
    pathname: "/capitulo/the-infinite-mage-capitulo-166/",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "The Infinite Mage",
    chapter: 166,
    externalMangaId: "the-infinite-mage",
    sourceDomain: "mangalivre.blog",
  });
});

test("parseGeneric extracts chapter from title-first pages like Pluma Comics", () => {
  const documentRef = createDocument({
    title: "Capítulo 259 - Providência de Alto Nível | Pluma Comics",
    selectors: {
      "meta[property='og:title']": createNode({
        content: "Capítulo 259 - Providência de Alto Nível | Pluma Comics",
      }),
    },
  });

  const payload = parseGeneric(documentRef, {
    hostname: "plumacomics.cloud",
    pathname: "/ler/4616",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "Providência de Alto Nível",
    chapter: 259,
    externalMangaId: "providencia-de-alto-nivel",
    sourceDomain: "plumacomics.cloud",
  });
});

test("parseSeriesSlugNumberPath handles LycanToons numeric chapter routes", () => {
  const documentRef = createDocument({
    title: "Eu Me Tornei o Primeiro Príncipe Rebelde",
  });

  const payload = parseSeriesSlugNumberPath(documentRef, {
    hostname: "lycantoons.com",
    pathname: "/series/eu-me-tornei-o-primeiro-principe-rebelde/33",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "Eu Me Tornei o Primeiro Príncipe Rebelde",
    chapter: 33,
    externalMangaId: "eu-me-tornei-o-primeiro-principe-rebelde",
    sourceDomain: "lycantoons.com",
  });
});

test("parseSingleSlugNumberPath handles ToonLivre numeric chapter routes", () => {
  const documentRef = createDocument({
    title: "Reencarnei Como Um Cirurgião Lendário - Capítulo 190",
  });

  const payload = parseSingleSlugNumberPath(documentRef, {
    hostname: "toonlivre.net",
    pathname: "/reencarnei-como-um-cirurgiao-lendario/190",
    protocol: "https:",
  });

  assert.deepEqual(payload, {
    title: "Reencarnei Como Um Cirurgião Lendário",
    chapter: 190,
    externalMangaId: "reencarnei-como-um-cirurgiao-lendario",
    sourceDomain: "toonlivre.net",
  });
});

test("parseGeneric returns null without chapter evidence", () => {
  const documentRef = createDocument({
    title: "Random Manga",
    bodyText: "Lots of unrelated numbers like 2026 and 1080p.",
  });

  const payload = parseGeneric(documentRef, {
    hostname: "reader.example.com",
    pathname: "/manga/random-manga/read",
    protocol: "https:",
  });

  assert.equal(payload, null);
});

test("detectMangaPayload routes by domain and protocol", () => {
  const mangalivreDoc = createDocument({
    selectors: {
      "meta[property='og:title']": createNode({
        content: "Bleach - Capitulo 22",
      }),
    },
  });

  const fromMangaLivre = detectMangaPayload(mangalivreDoc, {
    hostname: "mangalivre.tv",
    pathname: "/manga/bleach/capitulo-22/",
    protocol: "https:",
  });
  assert.equal(fromMangaLivre?.chapter, 22);

  const unsupportedProtocol = detectMangaPayload(mangalivreDoc, {
    hostname: "mangalivre.tv",
    pathname: "/manga/bleach/capitulo-22/",
    protocol: "chrome-extension:",
  });
  assert.equal(unsupportedProtocol, null);

  const lycanDoc = createDocument({
    title: "Eu Me Tornei o Primeiro Príncipe Rebelde - Capítulo 33",
  });
  const fromLycan = detectMangaPayload(lycanDoc, {
    hostname: "lycantoons.com",
    pathname: "/series/eu-me-tornei-o-primeiro-principe-rebelde/33",
    protocol: "https:",
  });
  assert.equal(fromLycan?.chapter, 33);
  assert.equal(fromLycan?.externalMangaId, "eu-me-tornei-o-primeiro-principe-rebelde");

  const toonLivreDoc = createDocument({
    title: "Reencarnei Como Um Cirurgião Lendário - Capítulo 190",
  });
  const fromToonLivre = detectMangaPayload(toonLivreDoc, {
    hostname: "toonlivre.net",
    pathname: "/reencarnei-como-um-cirurgiao-lendario/190",
    protocol: "https:",
  });
  assert.equal(fromToonLivre?.chapter, 190);
  assert.equal(fromToonLivre?.externalMangaId, "reencarnei-como-um-cirurgiao-lendario");
});

test("detectMangaPayload honors parser mode from partner config", () => {
  const documentRef = createDocument({
    title: "The Great Mage Returns After 4000 Years - Chapter 12",
  });

  const payload = detectMangaPayload(
    documentRef,
    {
      hostname: "partner.example.com",
      pathname: "/series/the-great-mage-returns-after-4000-years/12",
      protocol: "https:",
    },
    {
      parserMode: "seriesSlugNumberPath",
    },
  );

  assert.deepEqual(payload, {
    title: "The Great Mage Returns After 4000 Years",
    chapter: 12,
    externalMangaId: "the-great-mage-returns-after-4000-years",
    sourceDomain: "partner.example.com",
  });
});
