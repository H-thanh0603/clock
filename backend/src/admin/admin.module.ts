import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UploadsController } from './uploads.controller';

@Module({
  providers: [AdminService],
  controllers: [AdminController, UploadsController],
})
export class AdminModule {}
