import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../common/guards';
import { ActorId, CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('orders')
  listOrders(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.list(
      status || undefined,
      Number(page) || 1,
      Number(limit) || 20,
    );
  }

  @Patch('orders/:id')
  @HttpCode(200)
  updateStatus(
    @Param('id') id: string,
    @Body()
    body: { status?: string; refundRef?: string; paymentRef?: string; note?: string },
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.updateStatus(id, String(body.status ?? ''), user.id, {
      refundRef: body.refundRef,
      paymentRef: body.paymentRef,
      note: body.note,
    });
  }

  @Get('users')
  listUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.listUsers(Number(page) || 1, Number(limit) || 20);
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(id);
  }

  @Get('products')
  listProducts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('includeHidden') includeHidden?: string,
  ) {
    // Backoffice thấy CẢ SP ẩn (inBoutique=false) — khác catalog public.
    return this.admin.listProducts(
      Number(page) || 1,
      Number(limit) || 20,
      q || undefined,
      includeHidden !== '0',
    );
  }

  @Post('products')
  @HttpCode(201)
  createProduct(
    @Body() body: Record<string, unknown>,
    @ActorId() actor: string | undefined,
  ) {
    return this.admin.createProduct(body, actor);
  }

  @Patch('products/:slug')
  @HttpCode(200)
  updateProduct(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @ActorId() actor: string | undefined,
  ) {
    return this.admin.updateProduct(slug, body, actor);
  }

  @Get('products/:slug/events')
  productEvents(@Param('slug') slug: string) {
    return this.admin.productEvents(slug);
  }

  @Get('promotions')
  listPromotions(@Query('active') active?: string) {
    return this.admin.listPromotions(
      active === undefined || active === '' ? undefined : active !== '0',
    );
  }

  @Post('promotions')
  @HttpCode(201)
  createPromotion(
    @Body() body: Record<string, unknown>,
    @ActorId() actor: string | undefined,
  ) {
    return this.admin.createPromotion(body, actor);
  }

  @Patch('promotions/:id')
  @HttpCode(200)
  setPromotionActive(
    @Param('id') id: string,
    @Body() body: { active?: boolean },
  ) {
    return this.admin.setPromotionActive(id, body.active !== false);
  }

  @Get('campaigns')
  listCampaigns(@Query('status') status?: string) {
    return this.admin.listCampaigns(status || undefined);
  }

  @Post('campaigns')
  @HttpCode(201)
  createCampaign(
    @Body() body: Record<string, unknown>,
    @ActorId() actor: string | undefined,
  ) {
    return this.admin.createCampaign(body, actor);
  }

  @Patch('campaigns/:id')
  @HttpCode(200)
  updateCampaign(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateCampaign(id, body);
  }

  @Get('metrics')
  metrics(
    @Query('metric') metric?: string,
    @Query('granularity') granularity?: string,
    @Query('days') days?: string,
  ) {
    return this.admin.metrics(metric || 'sales', granularity || 'day', Number(days) || 30);
  }

  // -- Hóa đơn điện tử (kế toán phát hành tay qua portal NCC) --

  @Get('invoices')
  listInvoices(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.listInvoices(
      status || undefined,
      Number(page) || 1,
      Math.min(Number(limit) || 20, 100),
    );
  }

  /**
   * Đánh dấu ISSUED tay sau khi phát hành qua portal nhà cung cấp.
   * Cần `number` (số hóa đơn AUR-...) để đối chiếu sau này; FAILED khi
   * NCC từ chối (ghi externalRef = lý do để lần sau tra được).
   */
  @Patch('invoices/:id')
  @HttpCode(200)
  setInvoiceStatus(
    @Param('id') id: string,
    @Body() body: { status?: string; number?: string; externalRef?: string },
    @ActorId() actor: string | undefined,
  ) {
    return this.admin.setInvoiceStatus(id, body, actor);
  }

  /** Phát hành lại qua NCC đã cấu hình (EINVOICE_*) — retry cho FAILED. */
  @Post('invoices/:id/retry')
  @HttpCode(200)
  retryInvoice(@Param('id') id: string) {
    return this.admin.retryInvoice(id);
  }
}
