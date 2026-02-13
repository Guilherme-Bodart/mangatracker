import { Module } from '@nestjs/common';
import { MangaDexService } from './mangadex.service';

@Module({
  providers: [MangaDexService],
  exports: [MangaDexService],
})
export class MangaDexModule {}
