import { Injectable } from '@nestjs/common';
import {
  AddMangaToListDto,
  JikanSearchResponse,
  UpdateMangaListDto,
} from './dto/manga.dto';
import { MangaSearchService } from './manga-search.service';
import { MangaListService } from './manga-list.service';
import { MangaProfileService } from './manga-profile.service';
import {
  LatestChapterDto,
  MangaChaptersService,
} from './manga-chapters.service';

type JikanMangaDetails = {
  mal_id: number;
  title: string;
  status?: string | null;
  chapters?: number | null;
  images?: {
    jpg?: {
      large_image_url?: string | null;
    };
  };
  synopsis?: string | null;
  authors?: Array<{ name: string }>;
  genres?: Array<{ name: string }>;
};

@Injectable()
export class MangaService {
  constructor(
    private readonly mangaSearchService: MangaSearchService,
    private readonly mangaListService: MangaListService,
    private readonly mangaProfileService: MangaProfileService,
    private readonly mangaChaptersService: MangaChaptersService,
  ) {}

  async searchManga(
    query: string,
    page: number = 1,
    genres?: string,
    genresMode: 'AND' | 'OR' = 'OR',
    type?: string,
    allowNsfw: boolean = false,
  ): Promise<JikanSearchResponse> {
    return this.mangaSearchService.searchManga(
      query,
      page,
      genres,
      genresMode,
      type,
      allowNsfw,
    );
  }

  async getTopManga(
    page: number = 1,
    allowNsfw: boolean = false,
  ): Promise<JikanSearchResponse> {
    return this.mangaSearchService.getTopManga(page, allowNsfw);
  }

  async getMangaDetails(
    malId: number,
    title?: string,
    jikanManga?: JikanMangaDetails | null,
  ) {
    return this.mangaListService.getMangaDetails(malId, title, jikanManga);
  }

  async addMangaToList(userId: string, addMangaDto: AddMangaToListDto) {
    return this.mangaListService.addMangaToList(userId, addMangaDto);
  }

  async getUserList(userId: string) {
    return this.mangaListService.getUserList(userId);
  }

  async getUserListByUsername(username: string) {
    return this.mangaProfileService.getUserListByUsername(username);
  }

  async getProfileLikeState(username: string, currentUserId: string) {
    return this.mangaProfileService.getProfileLikeState(
      username,
      currentUserId,
    );
  }

  async toggleProfileLike(username: string, currentUserId: string) {
    return this.mangaProfileService.toggleProfileLike(username, currentUserId);
  }

  async getProfileRanking(limit: number = 100) {
    return this.mangaProfileService.getProfileRanking(limit);
  }

  async updateUserManga(
    userMangaId: string,
    userId: string,
    dto: UpdateMangaListDto,
  ) {
    return this.mangaListService.updateUserManga(userMangaId, userId, dto);
  }

  async removeFromUserList(userMangaId: string, userId: string) {
    return this.mangaListService.removeFromUserList(userMangaId, userId);
  }

  async toggleFavorite(userMangaId: string, userId: string) {
    return this.mangaListService.toggleFavorite(userMangaId, userId);
  }

  async getLatestChaptersForUserList(
    userId: string,
  ): Promise<Record<string, LatestChapterDto[]>> {
    return this.mangaChaptersService.getLatestChaptersForUserList(userId);
  }
}
