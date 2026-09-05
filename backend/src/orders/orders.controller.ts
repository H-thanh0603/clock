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
import { Throttle } from '@nestjs/throttler';
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
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async byCode(@Param('code') code: string) {
    const order = await this.orders.byCode(code);
    if (!order) throw new NotFoundException('Không thấy đơn hàng');
    return order;
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(OptionalSessionGuard)
  cancelMine(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser | null,
  ) {
    return this.orders.cancel(id, { userId: user?.id ?? null });
  }

  @Post('by-code/:code/cancel')
  @HttpCode(200)
  cancelByCode(
    @Param('code') code: string,
    @Body() body: { contact?: string },
  ) {
    if (!body.contact) throw new NotFoundException('Thiếu thông tin liên lạc');
    return this.orders.cancelByCode(code, String(body.contact));
  }
}
