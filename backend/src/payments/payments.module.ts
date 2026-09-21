import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  PaymentsController,
  PaymentIntentsController,
  PaymentsMethodsController,
} from './payments.controller';

@Module({
  providers: [PaymentsService],
  controllers: [
    PaymentsMethodsController,
    PaymentIntentsController,
    PaymentsController,
  ],
  // OrdersService cần tạo link VNPay hộ khi agent thanh toán trong hạn mức.
  exports: [PaymentsService],
})
export class PaymentsModule {}
