import { Module } from '@nestjs/common';
import { ExternalApiHttpModule } from '../common/http/external-api-http.module';
import { MangaUpdatesService } from './mangaupdates.service';

@Module({
  imports: [ExternalApiHttpModule],
  providers: [MangaUpdatesService],
  exports: [MangaUpdatesService],
})
export class MangaUpdatesModule {}
