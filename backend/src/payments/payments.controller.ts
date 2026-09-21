import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import {
  OptionalSessionGuard,
  RequiredAuthGuard,
} from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';
import { simulatedMethodsEnabled } from '../orders/orders.service';

const ALL_METHODS = ['centurion', 'escrow', 'deposit', 'vnpay', 'cod'] as const;

/** FE checkout gọi để biết method thanh toán nào đang được phép. */
@Controller('payments')
export class PaymentsMethodsController {
  @Get('methods')
  methods() {
    const enabled = simulatedMethodsEnabled();
    const methods = (ALL_METHODS as readonly string[]).filter(
      (m) => m === 'vnpay' || enabled,
    );
    return { methods };
  }
}

/**
 * Hạn mức thanh toán hộ cho AI concierge (agentic checkout).
 *
 * Luồng đúng: user bấm "cho phép agent thanh toán tới X" ở FE → BE tạo
 * intent (ACTIVE, TTL 15 phút) → agent tạo đơn kèm paymentIntentId trong
 * hạn mức → BE khóa intent + tạo link VNPay hộ. Agent KHÔNG BAO GIỜ tự
 * quyết số tiền: trần do user duyệt, tổng đơn do server chốt giá.
 */
@Controller('payments/intents')
@UseGuards(RequiredAuthGuard)
export class PaymentIntentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** User duyệt hạn mức mới — intent cũ cùng user tự revoke để khỏi nhầm. */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  create(
    @Body() body: { maxUsd?: number; method?: string; ttlMinutes?: number },
    @CurrentUser() user: SessionUser,
  ) {
    if (user.role === 'ADMIN') {
      throw new ForbiddenException('Admin không dùng thanh toán hộ');
    }
    return this.payments.createIntent(user.id, body);
  }

  /** Liệt kê intent còn hiệu lực của chính mình (FE hiện "đang cho phép"). */
  @Get()
  mine(@CurrentUser() user: SessionUser) {
    return this.payments.listIntents(user.id);
  }

  /** Thu hồi hạn mức (đổi ý) — intent đã USED thì không revoke được. */
  @Delete(':id')
  @HttpCode(200)
  revoke(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.payments.revokeIntent(user.id, id);
  }
}

@Controller('payments/vnpay')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('create')
  @HttpCode(200)
  @UseGuards(OptionalSessionGuard)
  // Mỗi link tạo 1 payment PENDING (giới hạn 3/đơn trong service) — không
  // throttle thì script spam link đốt hạn mức VNPay + phình bảng payment.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Body() body: { orderId?: string },
    @CurrentUser() user: SessionUser | null,
    @Req() req: Request,
  ) {
    return this.payments.createPayUrl(
      String(body.orderId ?? ''),
      user?.id ?? null,
      req,
    );
  }

  @Get('return')
  async vnpayReturn(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const url = await this.payments.handleReturn(query);
    return res.redirect(url);
  }

  @Get('ipn')
  ipn(@Query() query: Record<string, string>) {
    return this.payments.handleIpn(query);
  }
}
