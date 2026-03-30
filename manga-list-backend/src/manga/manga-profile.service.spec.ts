import { HttpException } from '@nestjs/common';
import { MangaProfileService } from './manga-profile.service';

describe('MangaProfileService', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userManga: {
      findMany: jest.fn(),
    },
    profileLike: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  let service: MangaProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MangaProfileService(prisma as never);
  });

  it('loads public profile with case-insensitive username match', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u-1',
      username: 'Outrigger',
      avatarUrl: null,
      bannerUrl: null,
      _count: {
        likesReceived: 3,
      },
    });
    prisma.userManga.findMany.mockResolvedValue([]);

    const result = await service.getUserListByUsername('outrigger');

    expect(result.user.username).toBe('Outrigger');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        username: {
          equals: 'outrigger',
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bannerUrl: true,
        _count: {
          select: {
            likesReceived: true,
          },
        },
      },
    });
  });

  it('throws not found when profile username does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(service.getUserListByUsername('missing-user')).rejects.toThrow(
      HttpException,
    );
  });
});
