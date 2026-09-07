import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UploadsController } from './uploads.controller';
import { StorageService } from '../common/storage.service';

@Module({
  providers: [AdminService, StorageService],
  controllers: [AdminController, UploadsController],
})
export class AdminModule {}
