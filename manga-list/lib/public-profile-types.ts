export interface MangaListItem {
  id: string;
  status: string;
  rating: number | null;
  currentChapter: number | null;
  notes: string | null;
  isFavorite: boolean;
  createdAt: string;
  manga: {
    id: string;
    malId: number;
    title: string;
    coverImage: string | null;
    author: string | null;
    genres: string[];
    totalChapters: number | null;
    description: string | null;
    descriptionPt: string | null;
    publicationStatus: string | null;
    lastChapter: string | null;
  };
}

export interface UserData {
  user: {
    id: string;
    username: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    totalLikes: number;
  };
  mangaList: MangaListItem[];
  stats: {
    total: number;
    reading: number;
    completed: number;
    planToRead: number;
    dropped: number;
    favorites: number;
  };
}

