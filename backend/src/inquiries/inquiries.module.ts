import { Module } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller';
import { NewsletterController } from './newsletter.controller';

@Module({
  controllers: [InquiriesController, NewsletterController],
})
export class InquiriesModule {}
