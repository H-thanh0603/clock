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

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('orders')
  listOrders(@Query('status') status?: string) {
    return this.admin.list(status || undefined);
  }

  @Patch('orders/:id')
  @HttpCode(200)
  updateStatus(@Param('id') id: string, @Body() body: { status?: string }) {
    return this.admin.updateStatus(id, String(body.status ?? ''));
  }

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(id);
  }

  @Post('products')
  @HttpCode(201)
  createProduct(@Body() body: Record<string, unknown>) {
    return this.admin.createProduct(body);
  }

  @Patch('products/:slug')
  @HttpCode(200)
  updateProduct(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.admin.updateProduct(slug, body);
  }
}
