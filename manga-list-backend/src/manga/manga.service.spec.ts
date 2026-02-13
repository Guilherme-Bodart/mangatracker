import { HttpException, HttpStatus } from '@nestjs/common';
import { MangaService } from './manga.service';
import { MangaListStatus } from './dto/manga.dto';

describe('MangaService', () => {
  let service: MangaService;

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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MangaService(
      prisma as never,
      cacheManager as never,
      mangaDexService as never,
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
    jest.spyOn(service, 'getMangaDetails').mockResolvedValue({
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
});
