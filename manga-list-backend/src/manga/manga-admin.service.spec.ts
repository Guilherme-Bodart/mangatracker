import { MangaAdminService } from './manga-admin.service';

describe('MangaAdminService', () => {
  const manga = {
    id: 'manga-1',
    malId: -101,
    anilistId: null,
    title: 'os classe s que criei',
    coverImage: null,
    author: null,
    genres: [],
    totalChapters: null,
    description: null,
    descriptionPt: null,
    publicationStatus: null,
    lastChapter: null,
  };

  const prisma = {
    manga: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mangaDexService = {
    searchMangaByTitle: jest.fn(),
    getCoverImageUrl: jest.fn(),
  };

  const externalApiHttpClient = {
    fetchJsonWithRetry: jest.fn(),
  };

  let service: MangaAdminService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma.manga.findUnique.mockImplementation(
      async (args: {
        where: { id?: string; malId?: number; anilistId?: number };
      }) => {
        if (args.where.id === manga.id) return manga;
        return null;
      },
    );

    prisma.manga.update.mockImplementation(async (args: { data: object }) => ({
      ...manga,
      ...args.data,
    }));

    externalApiHttpClient.fetchJsonWithRetry.mockImplementation(
      async (url: string, provider: string) => {
        if (provider === 'mangadex') {
          if (url.includes('os%20classe%20s%20que%20criei')) {
            return { data: [] };
          }

          expect(url).toContain('My%20S-Class%20Hunters');
          return {
            data: [
              {
                id: 'mangadex-1',
                attributes: {
                  title: { en: 'My S-Class Hunters' },
                  altTitles: [{ 'pt-br': 'Os classe-S que eu criei' }],
                  description: {
                    en: 'An F-rank hunter tries to protect the people he raised.',
                    'pt-br':
                      'Um hunter rank F tenta proteger as pessoas que criou.',
                  },
                  status: 'ongoing',
                  lastChapter: '186',
                },
                relationships: [
                  {
                    type: 'cover_art',
                    attributes: { fileName: 'cover.jpg' },
                  },
                ],
              },
            ],
          };
        }

        if (provider === 'jikan') {
          return {
            data: [
              {
                mal_id: 147202,
                title: 'My S-Class Hunters',
                title_english: 'My S-Class Hunters',
                images: {
                  jpg: {
                    large_image_url: 'https://cdn.example.test/jikan-cover.jpg',
                  },
                },
                status: 'Publishing',
                chapters: null,
                synopsis: 'Jikan synopsis.',
                authors: [{ name: 'Geunseo' }],
                genres: [{ name: 'Action' }, { name: 'Fantasy' }],
              },
            ],
          };
        }

        return null;
      },
    );

    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input, init) => {
        if (String(input).includes('api.mangaupdates.com')) {
          return new Response(
            JSON.stringify({
              results: [
                {
                  record: {
                    series_id: 47240416797,
                    title: 'My S-Class Hunters',
                  },
                  hit_title: 'Os classe-S que eu criei',
                },
              ],
            }),
            { status: 200 },
          );
        }

        const body = JSON.parse(String(init?.body ?? '{}')) as {
          variables?: { search?: string };
        };
        const search = body.variables?.search;
        const media =
          search === 'My S-Class Hunters'
            ? [
                {
                  id: 141958,
                  idMal: 147202,
                  title: {
                    english: 'My S-Class Hunters',
                    romaji: 'Naega Kiun S-Geupdeul',
                    native: '내가 키운 S급들',
                  },
                  synonyms: ['My S-Class Hunters'],
                  coverImage: {
                    large: 'https://cdn.example.test/anilist-cover.jpg',
                    medium: 'https://cdn.example.test/anilist-cover-small.jpg',
                  },
                  genres: ['Action', 'Fantasy'],
                  chapters: null,
                  description: 'AniList description.',
                  status: 'RELEASING',
                  staff: {
                    nodes: [{ name: { full: 'Geunseo' } }],
                  },
                },
              ]
            : [];

        return new Response(
          JSON.stringify({
            data: {
              Page: {
                media,
              },
            },
          }),
          { status: 200 },
        );
      });

    service = new MangaAdminService(
      prisma as never,
      mangaDexService as never,
      externalApiHttpClient as never,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('repairs full manga metadata by resolving a Portuguese title through English provider data', async () => {
    const result = await service.repairFullMangaById(manga.id);

    expect(result.changed).toBe(true);
    expect(result.previous.title).toBe('os classe s que criei');
    expect(result.matchedTitle).toBe('My S-Class Hunters');
    expect(result.searchedTitles).toEqual(
      expect.arrayContaining([
        'os classe s que criei',
        'My S-Class Hunters',
        'Os classe-S que eu criei',
      ]),
    );
    expect(result.sources).toEqual([
      'mangaupdates',
      'mangadex',
      'anilist',
      'jikan',
    ]);

    expect(prisma.manga.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: manga.id },
        data: expect.objectContaining({
          title: 'My S-Class Hunters',
          malId: 147202,
          anilistId: 141958,
          coverImage: 'https://cdn.example.test/anilist-cover.jpg',
          author: 'Geunseo',
          genres: ['Action', 'Fantasy'],
          description:
            'An F-rank hunter tries to protect the people he raised.',
          descriptionPt:
            'Um hunter rank F tenta proteger as pessoas que criou.',
          publicationStatus: 'Publishing',
          lastChapter: '186',
        }),
      }),
    );

    expect(result.manga.title).toBe('My S-Class Hunters');
    expect(result.manga.coverImage).toBe(
      'https://cdn.example.test/anilist-cover.jpg',
    );
  });
});
