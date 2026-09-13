import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UploadsController } from './uploads.controller';
import { StorageService } from '../common/storage.service';
import { ProductsModule } from '../products/products.module';
import { SearchModule } from '../search/search.module';
import { AgentShopperCleanupService } from '../agents/agent-shopper-cleanup.service';

@Module({
  imports: [ProductsModule, SearchModule], // AdminService dùng ProductsService.list + Meili sync
  providers: [AdminService, StorageService, AgentShopperCleanupService],
  controllers: [AdminController, UploadsController],
})
export class AdminModule {}
