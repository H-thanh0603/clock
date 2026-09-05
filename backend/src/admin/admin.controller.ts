import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../common/guards';

@Controller('admin/orders')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.admin.list(status || undefined);
  }

  @Patch(':id')
  @HttpCode(200)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.admin.updateStatus(id, String(body.status ?? ''));
  }
}
