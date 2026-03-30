import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalText(value: string | null | undefined): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

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
      titlePt: announcement.titlePt,
      titleEn: announcement.titleEn,
      messagePt: announcement.messagePt,
      messageEn: announcement.messageEn,
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
      titlePt: announcement.titlePt,
      titleEn: announcement.titleEn,
      messagePt: announcement.messagePt,
      messageEn: announcement.messageEn,
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
    const titlePt = this.normalizeOptionalText(dto.titlePt ?? dto.title);
    const titleEn = this.normalizeOptionalText(dto.titleEn);
    const messagePt = this.normalizeOptionalText(dto.messagePt ?? dto.message);
    const messageEn = this.normalizeOptionalText(dto.messageEn);

    if (!messagePt && !messageEn) {
      throw new BadRequestException(
        'At least one notification message (PT or EN) is required',
      );
    }

    const fallbackTitle = titlePt ?? titleEn;
    const fallbackMessage = messagePt ?? messageEn!;

    const created = await this.prisma.announcement.create({
      data: {
        title: fallbackTitle,
        message: fallbackMessage,
        titlePt,
        titleEn,
        messagePt,
        messageEn,
        createdByUserId: userId,
      },
    });

    return {
      id: created.id,
      title: created.title,
      message: created.message,
      titlePt: created.titlePt,
      titleEn: created.titleEn,
      messagePt: created.messagePt,
      messageEn: created.messageEn,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async updateAnnouncement(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        message: true,
        titlePt: true,
        titleEn: true,
        messagePt: true,
        messageEn: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    const nextTitlePt = Object.prototype.hasOwnProperty.call(dto, 'titlePt')
      ? this.normalizeOptionalText(dto.titlePt)
      : existing.titlePt;
    const nextTitleEn = Object.prototype.hasOwnProperty.call(dto, 'titleEn')
      ? this.normalizeOptionalText(dto.titleEn)
      : existing.titleEn;
    const nextMessagePt = Object.prototype.hasOwnProperty.call(dto, 'messagePt')
      ? this.normalizeOptionalText(dto.messagePt)
      : existing.messagePt;
    const nextMessageEn = Object.prototype.hasOwnProperty.call(dto, 'messageEn')
      ? this.normalizeOptionalText(dto.messageEn)
      : existing.messageEn;

    const nextLegacyTitle = Object.prototype.hasOwnProperty.call(dto, 'title')
      ? this.normalizeOptionalText(dto.title)
      : existing.title;
    const nextLegacyMessage = Object.prototype.hasOwnProperty.call(dto, 'message')
      ? this.normalizeOptionalText(dto.message)
      : existing.message;

    const finalMessagePt = nextMessagePt ?? nextLegacyMessage;
    const finalMessageEn = nextMessageEn;

    if (!finalMessagePt && !finalMessageEn) {
      throw new BadRequestException(
        'At least one notification message (PT or EN) is required',
      );
    }

    const finalTitlePt = nextTitlePt ?? nextLegacyTitle;
    const finalTitleEn = nextTitleEn;
    const fallbackTitle = finalTitlePt ?? finalTitleEn;
    const fallbackMessage = finalMessagePt ?? finalMessageEn!;

    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: fallbackTitle,
        message: fallbackMessage,
        titlePt: finalTitlePt,
        titleEn: finalTitleEn,
        messagePt: finalMessagePt,
        messageEn: finalMessageEn,
      },
    });

    return {
      id: updated.id,
      title: updated.title,
      message: updated.message,
      titlePt: updated.titlePt,
      titleEn: updated.titleEn,
      messagePt: updated.messagePt,
      messageEn: updated.messageEn,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      removedAt: updated.removedAt?.toISOString() ?? null,
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
