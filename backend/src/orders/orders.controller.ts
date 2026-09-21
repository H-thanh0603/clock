import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
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
  // Tạo đơn trừ kho ngay (kể cả khách vãng lai) — throttle riêng để chống
  // spam đơn giữ hàng loạt (audit HIGH-01). Sau fix trust-proxy, limit này
  // tính theo từng IP thật, không còn là bucket chung cả site.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Body() body: CreateOrderInput,
    @CurrentUser() user: SessionUser | null,
    // Idempotency-Key do FE sinh/lần bấm: retry mạng/double-click cùng key
    // → trả đơn cũ, không trừ kho lần 2 (P1-5). Thiếu/invalid = không dedup.
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // viaAgent: chỉ delegation token mới có — browser gửi paymentIntentId
    // cũng bị service bỏ qua (không leo thang từ browser).
    return this.orders.create(body, user?.id ?? null, {
      idempotencyKey,
      viaAgent: user?.viaAgent === true,
    });
  }

  @Get('mine')
  @UseGuards(RequiredAuthGuard)
  mine(
    @CurrentUser() user: SessionUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orders.mine(user.id, Number(page) || 1, Number(limit) || 10);
  }

  @Get('by-code/:code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseGuards(OptionalSessionGuard)
  async byCode(
    @Param('code') code: string,
    @Query('contact') contact?: string,
    @Query('sig') sig?: string,
    @CurrentUser() user?: SessionUser | null,
  ) {
    // Chi tiết chỉ cho chính chủ (session/contact/sig) — còn lại BE trả
    // {code, status} tối thiểu (P1-6).
    const order = await this.orders.byCode(code, {
      contact,
      sig,
      userId: user?.id ?? null,
    });
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
  // Mã đơn đoán được (AC-YYYY-6 số) + contact là SĐT/email — không throttle
  // thì dò mã + SĐT phổ biến để hủy đơn người khác (audit HIGH-04).
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancelByCode(
    @Param('code') code: string,
    @Body() body: { contact?: string },
  ) {
    if (!body.contact) throw new NotFoundException('Thiếu thông tin liên lạc');
    return this.orders.cancelByCode(code, String(body.contact));
  }
}
