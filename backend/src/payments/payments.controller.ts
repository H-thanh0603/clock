import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { OptionalSessionGuard } from '../common/guards';
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
