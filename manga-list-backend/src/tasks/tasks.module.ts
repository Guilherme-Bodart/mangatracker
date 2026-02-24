import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MangaDexModule } from '../mangadex/mangadex.module';
import { ExternalApiHttpModule } from '../common/http/external-api-http.module';

@Module({
  imports: [PrismaModule, MangaDexModule, ExternalApiHttpModule],
  providers: [TasksService],
})
export class TasksModule {}
