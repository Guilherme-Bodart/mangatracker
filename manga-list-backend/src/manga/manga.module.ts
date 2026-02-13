import { Module } from '@nestjs/common';
import { MangaService } from './manga.service';
import { MangaController } from './manga.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, MangaDexModule, AuthModule],
  controllers: [MangaController],
  providers: [MangaService],
  exports: [MangaService],
})
export class MangaModule {}
