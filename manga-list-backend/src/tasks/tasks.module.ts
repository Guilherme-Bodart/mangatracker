import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MangaDexModule } from '../mangadex/mangadex.module';

@Module({
  imports: [PrismaModule, MangaDexModule],
  providers: [TasksService],
})
export class TasksModule {}
