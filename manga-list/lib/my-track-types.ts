export interface Manga {
  id: string;
  malId?: number;
  mal_id?: number;
  title: string;
  coverImage: string | null;
  author: string | null;
  genres: string[];
}

export interface LatestChapter {
  chapter: string;
  title: string | null;
  publishedAt: string | null;
}

export interface UserManga {
  id: string;
  status: "READING" | "COMPLETED" | "PLAN_TO_READ" | "DROPPED";
  rating: number | null;
  currentChapter: number | null;
  notes: string | null;
  isFavorite: boolean;
  manga: Manga;
}

