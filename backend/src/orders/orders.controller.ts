import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { OrdersService, type CreateOrderInput } from './orders.service';
import { OptionalSessionGuard, RequiredAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @HttpCode(200)
  @UseGuards(OptionalSessionGuard)
  create(
    @Body() body: CreateOrderInput,
    @CurrentUser() user: SessionUser | null,
  ) {
    return this.orders.create(body, user?.id ?? null);
  }

  @Get('mine')
  @UseGuards(RequiredAuthGuard)
  mine(@CurrentUser() user: SessionUser) {
    return this.orders.mine(user.id);
  }

  @Get('by-code/:code')
  async byCode(@Param('code') code: string) {
    const order = await this.orders.byCode(code);
    if (!order) throw new NotFoundException('Không thấy đơn hàng');
    return order;
  }
}
