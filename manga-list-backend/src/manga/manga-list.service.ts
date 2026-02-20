import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MangaDexService } from '../mangadex/mangadex.service';
import { ExternalApiHttpClient } from '../common/http/external-api-client';
import { AddMangaToListDto, UpdateMangaListDto } from './dto/manga.dto';

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
export class MangaListService {
  private readonly logger = new Logger(MangaListService.name);
  private readonly JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

  constructor(
    private readonly prisma: PrismaService,
    private readonly mangaDexService: MangaDexService,
    private readonly externalApiClient: ExternalApiHttpClient,
  ) {}

  async getMangaDetails(
    malId: number,
    title?: string,
    jikanManga?: JikanMangaDetails | null,
  ) {
    let manga = await this.prisma.manga.findUnique({
      where: { malId },
    });

    if (
      manga &&
      (manga.descriptionPt || manga.description) &&
      manga.lastChapter
    ) {
      return manga;
    }

    let mangaData: JikanMangaDetails | null | undefined = jikanManga;
    if (!mangaData) {
      const response = await this.fetchWithRetry(
        `${this.JIKAN_BASE_URL}/manga/${malId}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { data: JikanMangaDetails };
        mangaData = data.data;
      }
    }

    if (!mangaData && manga) {
      mangaData = this.buildFallbackMangaDataFromDb(manga);
    }

    if (!mangaData) return null;

    let descriptions: { en: string | null; pt: string | null } = {
      en: null,
      pt: null,
    };
    let dexStatus: string | null = null;
    let dexLastChapter: string | null = null;

    if (title || mangaData.title) {
      try {
        const dexManga = await this.mangaDexService.searchMangaByTitle(
          title || mangaData.title,
        );

        if (dexManga) {
          descriptions = await this.mangaDexService.getDescriptions(
            dexManga.id,
          );
          dexStatus = dexManga.attributes.status ?? null;
          dexLastChapter = dexManga.attributes.lastChapter ?? null;
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Failed to fetch from MangaDex, continuing with Jikan only: ${message}`,
        );
      }
    }

    const descriptionEn =
      descriptions.en || mangaData.synopsis || manga?.description || null;
    const descriptionPt = descriptions.pt || manga?.descriptionPt || null;

    let status = mangaData.status;
    if (dexStatus) {
      if (dexStatus === 'ongoing') status = 'Publishing';
      else if (dexStatus === 'completed') status = 'Finished';
      else if (dexStatus === 'hiatus') status = 'On Hiatus';
      else if (dexStatus === 'cancelled') status = 'Discontinued';
    }

    const lastChapter =
      dexLastChapter ||
      (status === 'Finished' ? mangaData.chapters?.toString() : null) ||
      manga?.lastChapter;

    if (manga) {
      manga = await this.prisma.manga.update({
        where: { id: manga.id },
        data: {
          description: descriptionEn,
          descriptionPt,
          publicationStatus: status,
          lastChapter,
          lastCheckedAt: new Date(),
        },
      });
    } else {
      manga = await this.prisma.manga.create({
        data: {
          malId: mangaData.mal_id,
          title: mangaData.title,
          coverImage: mangaData.images?.jpg?.large_image_url,
          author: mangaData.authors?.[0]?.name,
          genres: mangaData.genres?.map((g) => g.name) || [],
          totalChapters: mangaData.chapters,
          description: descriptionEn,
          descriptionPt,
          publicationStatus: status,
          lastChapter,
        },
      });
    }

    return manga;
  }

  async addMangaToList(userId: string, addMangaDto: AddMangaToListDto) {
    const { malId, status, rating, currentChapter, notes, isFavorite } =
      addMangaDto;
    const manga = await this.getMangaDetails(malId);

    if (!manga) {
      throw new HttpException(
        'Failed to fetch manga details',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const existing = await this.prisma.userManga.findFirst({
      where: {
        userId,
        mangaId: manga.id,
      },
    });

    if (existing) {
      throw new HttpException(
        'This manga is already in your list',
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.userManga.create({
      data: {
        userId,
        mangaId: manga.id,
        status,
        rating,
        currentChapter,
        notes,
        isFavorite: isFavorite || false,
      },
      include: {
        manga: true,
      },
    });
  }

  async getUserList(userId: string) {
    return this.prisma.userManga.findMany({
      where: { userId },
      include: {
        manga: true,
      },
      orderBy: [
        { isFavorite: 'desc' },
        { rating: 'desc' },
        { manga: { title: 'asc' } },
      ],
    });
  }

  async updateUserManga(
    userMangaId: string,
    userId: string,
    dto: UpdateMangaListDto,
  ) {
    const userManga = await this.prisma.userManga.findFirst({
      where: {
        id: userMangaId,
        userId,
      },
    });

    if (!userManga) {
      throw new HttpException(
        'Manga not found in your list',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.userManga.update({
      where: { id: userMangaId },
      data: dto,
      include: {
        manga: true,
      },
    });
  }

  async removeFromUserList(userMangaId: string, userId: string) {
    const userManga = await this.prisma.userManga.findFirst({
      where: {
        id: userMangaId,
        userId,
      },
    });

    if (!userManga) {
      throw new HttpException(
        'Manga not found in your list',
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.userManga.delete({
      where: { id: userMangaId },
    });

    return { message: 'Manga removed from list' };
  }

  async toggleFavorite(userMangaId: string, userId: string) {
    const userManga = await this.prisma.userManga.findFirst({
      where: {
        id: userMangaId,
        userId,
      },
    });

    if (!userManga) {
      throw new HttpException(
        'Manga not found in your list',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.prisma.userManga.update({
      where: { id: userMangaId },
      data: {
        isFavorite: !userManga.isFavorite,
      },
      include: {
        manga: true,
      },
    });
  }

  private buildFallbackMangaDataFromDb(manga: {
    malId: number;
    title: string;
    publicationStatus: string | null;
    totalChapters: number | null;
    coverImage: string | null;
    description: string | null;
  }): JikanMangaDetails {
    return {
      mal_id: manga.malId,
      title: manga.title,
      status: manga.publicationStatus,
      chapters: manga.totalChapters,
      images: { jpg: { large_image_url: manga.coverImage } },
      synopsis: manga.description,
    };
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    return this.externalApiClient.fetchWithRetry(url, 'jikan');
  }
}
