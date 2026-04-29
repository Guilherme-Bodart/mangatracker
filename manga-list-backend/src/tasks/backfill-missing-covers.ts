import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MangaService } from '../manga/manga.service';

type ScriptOptions = {
  apply: boolean;
  limit: number;
};

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    apply: false,
    limit: 100,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
    }
  }

  return options;
}

async function main() {
  const logger = new Logger('BackfillMissingCovers');
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const mangaService = app.get(MangaService);
    const summary = await mangaService.repairMissingCovers(
      options.limit,
      options.apply,
    );

    logger.log(
      `Missing cover backfill finished: total=${summary.total} updated=${summary.updated} unresolved=${summary.unresolved} apply=${summary.apply}`,
    );

    for (const item of summary.results) {
      const status = item.coverImage ? item.source : 'unresolved';
      logger.log(
        `[${status}] ${item.title} (${item.mangaId}) -> ${item.coverImage ?? 'no cover found'}`,
      );
    }
  } finally {
    await app.close();
  }
}

void main();
