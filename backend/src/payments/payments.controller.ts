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
import { PaymentsService } from './payments.service';
import { OptionalSessionGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

@Controller('payments/vnpay')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('create')
  @HttpCode(200)
  @UseGuards(OptionalSessionGuard)
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
