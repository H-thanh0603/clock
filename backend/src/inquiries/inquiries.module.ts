import { Module } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller';

@Module({
  controllers: [InquiriesController],
})
export class InquiriesModule {}
