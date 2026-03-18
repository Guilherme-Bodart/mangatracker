import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listUserAnnouncements(userId: string) {
    const announcements = await this.prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        reads: {
          where: { userId },
          select: { readAt: true },
          take: 1,
        },
      },
    });

    return announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      createdAt: announcement.createdAt.toISOString(),
      isRead: announcement.reads.length > 0,
      readAt: announcement.reads[0]?.readAt?.toISOString() ?? null,
    }));
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.announcement.count({
      where: {
        isActive: true,
        reads: {
          none: { userId },
        },
      },
    });

    return { count };
  }

  async markAllRead(userId: string) {
    const unreadAnnouncements = await this.prisma.announcement.findMany({
      where: {
        isActive: true,
        reads: {
          none: { userId },
        },
      },
      select: { id: true },
    });

    if (unreadAnnouncements.length > 0) {
      await this.prisma.announcementRead.createMany({
        data: unreadAnnouncements.map((announcement) => ({
          announcementId: announcement.id,
          userId,
        })),
        skipDuplicates: true,
      });
    }

    return {
      markedCount: unreadAnnouncements.length,
      unreadCount: 0,
    };
  }

  async listAdminAnnouncements(includeInactive: boolean) {
    const announcements = await this.prisma.announcement.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            reads: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return announcements.map((announcement) => ({
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      isActive: announcement.isActive,
      createdAt: announcement.createdAt.toISOString(),
      removedAt: announcement.removedAt?.toISOString() ?? null,
      readCount: announcement._count.reads,
      createdBy: announcement.createdBy
        ? {
            id: announcement.createdBy.id,
            username: announcement.createdBy.username,
            email: announcement.createdBy.email,
          }
        : null,
    }));
  }

  async createAnnouncement(userId: string, dto: CreateAnnouncementDto) {
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title?.trim() || null,
        message: dto.message.trim(),
        createdByUserId: userId,
      },
    });

    return {
      id: created.id,
      title: created.title,
      message: created.message,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async removeAnnouncement(id: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    if (!existing.isActive) {
      return { success: true, alreadyRemoved: true };
    }

    await this.prisma.announcement.update({
      where: { id },
      data: {
        isActive: false,
        removedAt: new Date(),
      },
    });

    return { success: true, alreadyRemoved: false };
  }
}

