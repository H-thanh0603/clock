import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderExpireService } from './order-expire.service';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [forwardRef(() => PaymentsModule)],
  providers: [OrdersService, OrderExpireService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
