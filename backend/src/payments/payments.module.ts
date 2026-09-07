import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  PaymentsController,
  PaymentsMethodsController,
} from './payments.controller';

@Module({
  providers: [PaymentsService],
  controllers: [PaymentsMethodsController, PaymentsController],
})
export class PaymentsModule {}
