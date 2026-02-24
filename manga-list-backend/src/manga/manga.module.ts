import { Module } from '@nestjs/common';
import { MangaService } from './manga.service';
import { MangaController } from './manga.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { AuthModule } from '../auth/auth.module';
import { MangaProfileService } from './manga-profile.service';
import { MangaSearchService } from './manga-search.service';
import { MangaListService } from './manga-list.service';
import { MangaChaptersService } from './manga-chapters.service';
import { ExternalApiHttpModule } from '../common/http/external-api-http.module';
import { MangaUpdatesModule } from '../mangaupdates/mangaupdates.module';

@Module({
  imports: [
    PrismaModule,
    MangaDexModule,
    MangaUpdatesModule,
    AuthModule,
    ExternalApiHttpModule,
  ],
  controllers: [MangaController],
  providers: [
    MangaService,
    MangaSearchService,
    MangaListService,
    MangaProfileService,
    MangaChaptersService,
  ],
  exports: [MangaService],
})
export class MangaModule {}
