import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderExpireService } from './order-expire.service';

@Module({
  providers: [OrdersService, OrderExpireService],
  controllers: [OrdersController],
  exports: [OrdersService],
})
export class OrdersModule {}
