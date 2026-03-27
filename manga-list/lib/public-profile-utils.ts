export const FALLBACK_COVER_IMAGE = "/logos/logo-icon-light.svg";

export const GENRE_TRANSLATION_KEYS: Record<string, string> = {
  Action: "action",
  Adventure: "adventure",
  Comedy: "comedy",
  Drama: "drama",
  Fantasia: "fantasy",
  Fantasy: "fantasy",
  Magic: "magic",
  Supernatural: "supernatural",
  Horror: "horror",
  Mystery: "mystery",
  Psychological: "psychological",
  Romance: "romance",
  "Sci-Fi": "sciFi",
  SliceOfLife: "sliceOfLife",
  "Slice of Life": "sliceOfLife",
  Sports: "sports",
  Historical: "historical",
  Military: "military",
  School: "school",
  Seinen: "seinen",
  Shoujo: "shoujo",
  Shounen: "shounen",
  Josei: "josei",
  Ecchi: "ecchi",
  Harem: "harem",
  Mecha: "mecha",
  Music: "music",
  Parody: "parody",
  Police: "police",
  Space: "space",
  Suspense: "suspense",
  Thriller: "thriller",
  Vampire: "vampire",
  Yaoi: "yaoi",
  Yuri: "yuri",
  Isekai: "isekai",
};

export function getUsernameFromPathname(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const userIndex = segments.indexOf("user");
  const usernameSegment = userIndex >= 0 ? segments[userIndex + 1] : undefined;
  if (!usernameSegment) {
    return "";
  }

  try {
    return decodeURIComponent(usernameSegment);
  } catch {
    return usernameSegment;
  }
}

export function resolveSafeCoverImage(
  coverImage: string | null | undefined,
  fallback: string,
): string {
  const normalized = String(coverImage || "").trim();
  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = new URL(normalized);
    return parsed.toString();
  } catch {
    return fallback;
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  const normalized = String(text || "").trim();
  if (!normalized) {
    throw new Error("empty-text");
  }

  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalized);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = normalized;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("copy-failed");
  }
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    READING: "bg-blue-500",
    COMPLETED: "bg-green-500",
    PLAN_TO_READ: "bg-yellow-500",
    DROPPED: "bg-red-500",
  };
  return colors[status] || "bg-gray-500";
}

export function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

