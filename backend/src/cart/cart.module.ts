import { Module } from '@nestjs/common';
import { PrismaCartStorage } from '../common/cart-storage';
import { CartController } from './cart.controller';

@Module({
  providers: [PrismaCartStorage],
  controllers: [CartController],
})
export class CartModule {}
