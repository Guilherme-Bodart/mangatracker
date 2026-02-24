import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TasksService } from './tasks.service';

type TaskMode = 'enrich' | 'updates' | 'all';

function parseMode(raw: string | undefined): TaskMode {
  const normalized = (raw ?? 'all').trim().toLowerCase();
  if (normalized === 'enrich') return 'enrich';
  if (normalized === 'updates') return 'updates';
  return 'all';
}

async function main() {
  const logger = new Logger('TasksManualRunner');
  const mode = parseMode(process.argv[2]);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const tasksService = app.get(TasksService);
    logger.log(`Running tasks in mode: ${mode}`);

    if (mode === 'enrich' || mode === 'all') {
      await tasksService.handleNewMangaMetadataEnrichment();
      logger.log('Metadata enrichment cycle completed.');
    }

    if (mode === 'updates' || mode === 'all') {
      await tasksService.handleMangaUpdates();
      logger.log('Manga updates cycle completed.');
    }

    logger.log('Manual task run finished.');
  } finally {
    await app.close();
  }
}

void main();
