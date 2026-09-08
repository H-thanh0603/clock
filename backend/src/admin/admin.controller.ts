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
import { CurrentUser } from '../common/current-user.decorator';
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
    @Body() body: { status?: string },
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.updateStatus(id, String(body.status ?? ''), user.id);
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

  @Post('products')
  @HttpCode(201)
  createProduct(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.createProduct(body, user.id);
  }

  @Patch('products/:slug')
  @HttpCode(200)
  updateProduct(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: SessionUser,
  ) {
    return this.admin.updateProduct(slug, body, user.id);
  }

  @Get('products/:slug/events')
  productEvents(@Param('slug') slug: string) {
    return this.admin.productEvents(slug);
  }
}
