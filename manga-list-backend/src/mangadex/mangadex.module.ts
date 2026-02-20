import { Module } from '@nestjs/common';
import { MangaDexService } from './mangadex.service';
import { ExternalApiHttpModule } from '../common/http/external-api-http.module';

@Module({
  imports: [ExternalApiHttpModule],
  providers: [MangaDexService],
  exports: [MangaDexService],
})
export class MangaDexModule {}
