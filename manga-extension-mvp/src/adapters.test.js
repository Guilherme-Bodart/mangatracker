const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseChapterFromText,
  sanitizeMangaTitle,
  parseMangaLivre,
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
});
