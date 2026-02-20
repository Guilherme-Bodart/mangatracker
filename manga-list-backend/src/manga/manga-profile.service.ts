import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { MangaStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MangaProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserListByUsername(username: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
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

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const mangaList = await this.prisma.userManga.findMany({
      where: { userId: user.id },
      include: {
        manga: true,
      },
      orderBy: [
        { isFavorite: 'desc' },
        { rating: 'desc' },
        { manga: { title: 'asc' } },
      ],
    });

    const stats = {
      total: mangaList.length,
      reading: mangaList.filter((m) => m.status === 'READING').length,
      completed: mangaList.filter((m) => m.status === 'COMPLETED').length,
      planToRead: mangaList.filter((m) => m.status === 'PLAN_TO_READ').length,
      dropped: mangaList.filter((m) => m.status === 'DROPPED').length,
      favorites: mangaList.filter((m) => m.isFavorite).length,
    };

    return {
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        totalLikes: user._count.likesReceived,
      },
      mangaList,
      stats,
    };
  }

  async getProfileLikeState(username: string, currentUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        _count: {
          select: {
            likesReceived: true,
          },
        },
      },
    });

    if (!targetUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (targetUser.id === currentUserId) {
      return {
        liked: false,
        isOwnProfile: true,
        totalLikes: targetUser._count.likesReceived,
      };
    }

    const existingLike = await this.prisma.profileLike.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: currentUserId,
          likedUserId: targetUser.id,
        },
      },
      select: { id: true },
    });

    return {
      liked: !!existingLike,
      isOwnProfile: false,
      totalLikes: targetUser._count.likesReceived,
    };
  }

  async toggleProfileLike(username: string, currentUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!targetUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (targetUser.id === currentUserId) {
      throw new HttpException(
        'You cannot like your own profile',
        HttpStatus.BAD_REQUEST,
      );
    }

    const existingLike = await this.prisma.profileLike.findUnique({
      where: {
        likerId_likedUserId: {
          likerId: currentUserId,
          likedUserId: targetUser.id,
        },
      },
      select: { id: true },
    });

    if (existingLike) {
      await this.prisma.profileLike.delete({
        where: { id: existingLike.id },
      });
    } else {
      await this.prisma.profileLike.create({
        data: {
          likerId: currentUserId,
          likedUserId: targetUser.id,
        },
      });
    }

    const totalLikes = await this.prisma.profileLike.count({
      where: { likedUserId: targetUser.id },
    });

    return {
      liked: !existingLike,
      totalLikes,
    };
  }

  async getProfileRanking(limit: number = 100) {
    const safeLimit = Math.max(1, Math.min(limit, 100));

    const users = await this.prisma.user.findMany({
      take: safeLimit,
      orderBy: [{ likesReceived: { _count: 'desc' } }, { createdAt: 'asc' }],
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

    if (users.length === 0) {
      return { ranking: [] };
    }

    const userIds = users.map((user) => user.id);
    const groupedStatuses = await this.prisma.userManga.groupBy({
      by: ['userId', 'status'],
      where: {
        userId: { in: userIds },
        status: { in: [MangaStatus.COMPLETED, MangaStatus.READING] },
      },
      _count: {
        _all: true,
      },
    });

    const statusMap = new Map<string, { completed: number; reading: number }>();

    for (const entry of groupedStatuses) {
      const current = statusMap.get(entry.userId) ?? {
        completed: 0,
        reading: 0,
      };

      if (entry.status === MangaStatus.COMPLETED) {
        current.completed = entry._count._all;
      }

      if (entry.status === MangaStatus.READING) {
        current.reading = entry._count._all;
      }

      statusMap.set(entry.userId, current);
    }

    const ranking = users.map((user, index) => {
      const stats = statusMap.get(user.id) ?? { completed: 0, reading: 0 };

      return {
        rank: index + 1,
        username: user.username,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        likes: user._count.likesReceived,
        completed: stats.completed,
        reading: stats.reading,
      };
    });

    return { ranking };
  }
}
