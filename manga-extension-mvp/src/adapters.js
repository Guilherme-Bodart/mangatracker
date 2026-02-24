function parseChapterFromText(value) {
  if (!value) return null;
  const match = String(value).match(/(\d+)(?:\.\d+)?/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function titleizeSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function sanitizeMangaTitle(title) {
  if (!title) return "";
  return String(title)
    .replace(/\s*[-|]\s*Cap[ií]tulo\s+\d+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMangaLivre(documentRef, locationRef) {
  const match = locationRef.pathname.match(
    /^\/manga\/([^/]+)\/capitulo-(\d+)\/?$/i,
  );
  if (!match) {
    return null;
  }

  const mangaSlug = match[1].toLowerCase();
  const chapter = Number.parseInt(match[2], 10);
  if (!Number.isFinite(chapter)) {
    return null;
  }

  const ogTitle = documentRef
    .querySelector("meta[property='og:title']")
    ?.getAttribute("content");
  const h1Title = documentRef.querySelector("h1")?.textContent;
  const pageTitle = documentRef.title;

  const title =
    sanitizeMangaTitle(ogTitle) ||
    sanitizeMangaTitle(h1Title) ||
    sanitizeMangaTitle(pageTitle) ||
    titleizeSlug(mangaSlug);

  if (!title) {
    return null;
  }

  return {
    title,
    chapter,
    externalMangaId: mangaSlug,
    sourceDomain: locationRef.hostname,
  };
}

function parseGeneric(documentRef, locationRef) {
  const titleCandidates = [
    documentRef.querySelector("meta[property='og:title']")?.content,
    documentRef.querySelector("h1")?.textContent,
    documentRef.title,
  ].filter(Boolean);
  const title = titleCandidates[0]?.trim();
  if (!title) {
    return null;
  }

  const chapterHints = [
    documentRef.querySelector("meta[name='chapter']")?.content,
    documentRef.querySelector("[data-chapter]")?.getAttribute("data-chapter"),
    documentRef.querySelector(".chapter")?.textContent,
    documentRef.body?.textContent?.slice(0, 2000),
  ].filter(Boolean);

  let chapter = null;
  for (const hint of chapterHints) {
    chapter = parseChapterFromText(hint);
    if (chapter !== null) break;
  }

  if (chapter === null) {
    return null;
  }

  const pathname = locationRef.pathname || "/";
  const externalMangaId =
    pathname
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join("-")
      .toLowerCase() || title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return {
    title,
    chapter,
    externalMangaId,
    sourceDomain: locationRef.hostname,
  };
}

function detectMangaPayload(documentRef, locationRef) {
  const hostname = locationRef.hostname.toLowerCase();
  if (hostname === "mangalivre.tv" || hostname.endsWith(".mangalivre.tv")) {
    return parseMangaLivre(documentRef, locationRef);
  }

  return parseGeneric(documentRef, locationRef);
}

globalThis.detectMangaPayload = detectMangaPayload;
