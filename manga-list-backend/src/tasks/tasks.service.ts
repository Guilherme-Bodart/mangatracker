import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Manga } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MangaDexService } from '../mangadex/mangadex.service';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private mangaDexService: MangaDexService,
  ) {}

  // Run every hour to check for updates
  @Cron(CronExpression.EVERY_HOUR)
  async handleMangaUpdates() {
    this.logger.log('Checking for manga updates...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find mangas that haven't been checked in 7 days or never checked
    // And are not finished/completed
    const mangasToUpdate = await this.prisma.manga.findMany({
      where: {
        OR: [{ lastCheckedAt: { lt: sevenDaysAgo } }, { lastCheckedAt: null }],
        publicationStatus: {
          notIn: ['Finished', 'Discontinued'], // Only update active/ongoing series
        },
      },
      take: 5, // Limit to 5 mangas per run to respect rate limits
      orderBy: {
        lastCheckedAt: 'asc', // Prioritize oldest checks first
      },
    });

    if (mangasToUpdate.length === 0) {
      this.logger.log('No mangas need updates.');
      return;
    }

    this.logger.log(`Found ${mangasToUpdate.length} mangas to update.`);
    let successCount = 0;

    for (const manga of mangasToUpdate) {
      try {
        await this.updateManga(manga);
        successCount++;
        // Add a small delay between requests to be safe
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to update manga ${manga.title} (${manga.id}): ${message}`,
        );
      }
    }

    this.logger.log(`Updated ${successCount}/${mangasToUpdate.length} mangas.`);
  }

  private async updateManga(manga: Manga) {
    this.logger.log(`Updating ${manga.title}...`);

    let dexStatus = null;
    let dexLastChapter = null;

    try {
      // 1. Search MangaDex by title to get ID (if we don't store it)
      // Note: Ideal would be to store MangaDex ID in our DB, but search works for now
      const dexManga = await this.mangaDexService.searchMangaByTitle(
        manga.title,
      );

      if (dexManga) {
        dexStatus = dexManga.attributes.status;
        dexLastChapter = dexManga.attributes.lastChapter;
      }
    } catch {
      this.logger.warn(`Could not fetch from MangaDex for ${manga.title}`);
    }

    // Map Status
    let newStatus = manga.publicationStatus;
    if (dexStatus) {
      if (dexStatus === 'ongoing') newStatus = 'Publishing';
      else if (dexStatus === 'completed') newStatus = 'Finished';
      else if (dexStatus === 'hiatus') newStatus = 'On Hiatus';
      else if (dexStatus === 'cancelled') newStatus = 'Discontinued';
    }

    // Update DB
    await this.prisma.manga.update({
      where: { id: manga.id },
      data: {
        publicationStatus: newStatus,
        lastChapter: dexLastChapter || manga.lastChapter,
        lastCheckedAt: new Date(),
      },
    });
  }
}
