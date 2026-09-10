import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UploadsController } from './uploads.controller';
import { StorageService } from '../common/storage.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule], // AdminService dùng ProductsService.list
  providers: [AdminService, StorageService],
  controllers: [AdminController, UploadsController],
})
export class AdminModule {}
