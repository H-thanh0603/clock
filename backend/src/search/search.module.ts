import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MeiliService } from './meili.service';

@Module({
  imports: [PrismaModule],
  providers: [MeiliService],
  exports: [MeiliService],
})
export class SearchModule {}
