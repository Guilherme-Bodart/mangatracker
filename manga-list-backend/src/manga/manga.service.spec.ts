import { HttpException, HttpStatus } from '@nestjs/common';
import { MangaService } from './manga.service';
import { MangaListStatus } from './dto/manga.dto';
import { MangaSearchService } from './manga-search.service';
import { MangaListService } from './manga-list.service';
import { MangaProfileService } from './manga-profile.service';
import { MangaChaptersService } from './manga-chapters.service';
import { ExternalApiHttpClient } from '../common/http/external-api-client';
import { MangaAdminService } from './manga-admin.service';

describe('MangaService', () => {
  let service: MangaService;
  let mangaSearchService: MangaSearchService;
  let mangaListService: MangaListService;
  let mangaProfileService: MangaProfileService;
  let mangaChaptersService: MangaChaptersService;
  let mangaAdminService: MangaAdminService;
  let externalApiClient: ExternalApiHttpClient;

  const prisma = {
    manga: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    userManga: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const cacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mangaDexService = {
    searchMangaByTitle: jest.fn(),
    getDescriptions: jest.fn(),
    getLatestChapters: jest.fn(),
  };
  const mangaUpdatesService = {
    getLatestChaptersByTitle: jest.fn(),
  };
  const mangaAdminServiceMock = {
    listDuplicateGroups: jest.fn(),
    listMissingCovers: jest.fn(),
    mergeDuplicateGroup: jest.fn(),
    repairCoverByMangaId: jest.fn(),
    repairFullMangaById: jest.fn(),
    repairMissingCovers: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    externalApiClient = new ExternalApiHttpClient({
      timeoutMs: 1000,
      retries: 2,
      failureThreshold: 5,
      cooldownMs: 30000,
      initialBackoffMs: 1,
      maxBackoffMs: 2,
    });
    mangaSearchService = new MangaSearchService(
      cacheManager as never,
      externalApiClient,
    );
    mangaListService = new MangaListService(
      prisma as never,
      mangaDexService as never,
      externalApiClient,
    );
    mangaProfileService = new MangaProfileService(prisma as never);
    mangaChaptersService = new MangaChaptersService(
      prisma as never,
      cacheManager as never,
      mangaDexService as never,
      mangaUpdatesService as never,
    );
    mangaAdminService = mangaAdminServiceMock as never;
    service = new MangaService(
      mangaSearchService,
      mangaListService,
      mangaProfileService,
      mangaChaptersService,
      mangaAdminService,
    );
  });

  it('should return cached search result without calling external API', async () => {
    const cached = {
      data: [{ mal_id: 1, title: 'One Piece' }],
      pagination: {
        has_next_page: false,
        current_page: 1,
        last_visible_page: 1,
      },
    };
    cacheManager.get.mockResolvedValue(cached);
    const fetchSpy = jest.spyOn(global, 'fetch');

    const result = await service.searchManga('one piece', 1);

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('applies AND genre filtering when genresMode is AND', async () => {
    cacheManager.get.mockResolvedValue(null);
    const payload = {
      data: [
        {
          mal_id: 1,
          title: 'Manga 1',
          images: { jpg: { image_url: 'x', large_image_url: 'x' } },
          genres: [
            { mal_id: 1, name: 'Action' },
            { mal_id: 2, name: 'Adventure' },
          ],
        },
        {
          mal_id: 2,
          title: 'Manga 2',
          images: { jpg: { image_url: 'x', large_image_url: 'x' } },
          genres: [{ mal_id: 1, name: 'Action' }],
        },
        {
          mal_id: 3,
          title: 'Manga 3',
          images: { jpg: { image_url: 'x', large_image_url: 'x' } },
          genres: [{ mal_id: 2, name: 'Adventure' }],
        },
      ],
      pagination: {
        has_next_page: false,
        current_page: 1,
        last_visible_page: 1,
      },
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

    const result = await service.searchManga('', 1, '1,2', 'AND');

    expect(result.data.map((manga) => manga.mal_id)).toEqual([1]);
    fetchSpy.mockRestore();
  });

  it('applies OR genre filtering when genresMode is OR', async () => {
    cacheManager.get.mockResolvedValue(null);
    const payload = {
      data: [
        {
          mal_id: 1,
          title: 'Manga 1',
          images: { jpg: { image_url: 'x', large_image_url: 'x' } },
          genres: [{ mal_id: 1, name: 'Action' }],
        },
        {
          mal_id: 2,
          title: 'Manga 2',
          images: { jpg: { image_url: 'x', large_image_url: 'x' } },
          themes: [{ mal_id: 2, name: 'Adventure' }],
        },
        {
          mal_id: 3,
          title: 'Manga 3',
          images: { jpg: { image_url: 'x', large_image_url: 'x' } },
          genres: [{ mal_id: 4, name: 'Comedy' }],
        },
      ],
      pagination: {
        has_next_page: false,
        current_page: 1,
        last_visible_page: 1,
      },
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

    const result = await service.searchManga('', 1, '1,2', 'OR');

    expect(result.data.map((manga) => manga.mal_id)).toEqual([1, 2]);
    fetchSpy.mockRestore();
  });

  it('should throw TOO_MANY_REQUESTS when Jikan returns 429', async () => {
    cacheManager.get.mockResolvedValue(null);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 429 }));

    await expect(service.searchManga('naruto', 1)).rejects.toThrow(
      HttpException,
    );

    await expect(service.searchManga('naruto', 1)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    fetchSpy.mockRestore();
  });

  it('should cache successful top manga result with 24h ttl in seconds', async () => {
    cacheManager.get.mockResolvedValue(null);
    const payload = {
      data: [{ mal_id: 2, title: 'Berserk' }],
      pagination: {
        has_next_page: true,
        current_page: 1,
        last_visible_page: 2,
      },
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 }),
      );

    const result = await service.getTopManga(1);

    expect(result).toEqual(payload);
    expect(cacheManager.set).toHaveBeenCalledWith(
      'top-manga:1:false',
      payload,
      60 * 60 * 24 * 1000,
    );
    fetchSpy.mockRestore();
  });

  it('should block duplicate manga when adding to user list', async () => {
    jest.spyOn(mangaListService, 'getMangaDetails').mockResolvedValue({
      id: 'manga-1',
    } as never);
    prisma.userManga.findFirst.mockResolvedValue({
      id: 'user-manga-1',
    });

    await expect(
      service.addMangaToList('user-1', {
        malId: 1,
        status: MangaListStatus.READING,
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
    });
  });

  it('should limit latest chapter fetch concurrency using configured pool size', async () => {
    const previousValue = process.env.LATEST_CHAPTERS_CONCURRENCY;
    process.env.LATEST_CHAPTERS_CONCURRENCY = '2';

    try {
      externalApiClient = new ExternalApiHttpClient({
        timeoutMs: 1000,
        retries: 2,
        failureThreshold: 5,
        cooldownMs: 30000,
        initialBackoffMs: 1,
        maxBackoffMs: 2,
      });
      mangaSearchService = new MangaSearchService(
        cacheManager as never,
        externalApiClient,
      );
      mangaListService = new MangaListService(
        prisma as never,
        mangaDexService as never,
        externalApiClient,
      );
      mangaProfileService = new MangaProfileService(prisma as never);
      mangaChaptersService = new MangaChaptersService(
        prisma as never,
        cacheManager as never,
        mangaDexService as never,
        mangaUpdatesService as never,
      );
      mangaAdminService = mangaAdminServiceMock as never;
      service = new MangaService(
        mangaSearchService,
        mangaListService,
        mangaProfileService,
        mangaChaptersService,
        mangaAdminService,
      );

      prisma.userManga.findMany.mockResolvedValue([
        { manga: { id: 'm1', title: 'Manga 1' } },
        { manga: { id: 'm2', title: 'Manga 2' } },
        { manga: { id: 'm3', title: 'Manga 3' } },
        { manga: { id: 'm4', title: 'Manga 4' } },
        { manga: { id: 'm5', title: 'Manga 5' } },
      ]);

      let active = 0;
      let maxActive = 0;
      jest
        .spyOn(
          mangaChaptersService as unknown as {
            getLatestChaptersForManga: (
              mangaId: string,
              title: string,
            ) => Promise<unknown>;
          },
          'getLatestChaptersForManga',
        )
        .mockImplementation(async () => {
          active++;
          maxActive = Math.max(maxActive, active);
          await new Promise((resolve) => setTimeout(resolve, 20));
          active--;
          return [];
        });

      await service.getLatestChaptersForUserList('user-1');
      expect(maxActive).toBeLessThanOrEqual(2);
    } finally {
      if (previousValue === undefined) {
        delete process.env.LATEST_CHAPTERS_CONCURRENCY;
      } else {
        process.env.LATEST_CHAPTERS_CONCURRENCY = previousValue;
      }
    }
  });

  it('should delegate missing cover repair to admin service', async () => {
    const summary = {
      total: 2,
      updated: 1,
      unresolved: 1,
      apply: true,
      results: [],
    };
    mangaAdminServiceMock.repairMissingCovers.mockResolvedValue(summary);

    await expect(service.repairMissingCovers(25, true)).resolves.toBe(summary);
    expect(mangaAdminServiceMock.repairMissingCovers).toHaveBeenCalledWith(
      25,
      true,
    );
  });

  it('should delegate missing cover listing to admin service', async () => {
    const response = {
      total: 1,
      items: [{ id: 'manga-1', title: 'No Cover' }],
    };
    mangaAdminServiceMock.listMissingCovers.mockResolvedValue(response);

    await expect(service.listMissingCovers(15)).resolves.toBe(response);
    expect(mangaAdminServiceMock.listMissingCovers).toHaveBeenCalledWith(15);
  });

  it('should delegate full manga repair to admin service', async () => {
    const response = {
      mangaId: 'manga-1',
      changed: true,
      matchedTitle: 'My S-Class Hunters',
    };
    mangaAdminServiceMock.repairFullMangaById.mockResolvedValue(response);

    await expect(service.repairFullMangaById('manga-1')).resolves.toBe(
      response,
    );
    expect(mangaAdminServiceMock.repairFullMangaById).toHaveBeenCalledWith(
      'manga-1',
    );
  });
});
