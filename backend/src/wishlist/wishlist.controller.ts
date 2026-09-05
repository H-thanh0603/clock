import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { RequiredAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

@Controller('wishlist')
@UseGuards(RequiredAuthGuard)
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.wishlist.list(user.id);
  }

  @Post('merge')
  @HttpCode(200)
  merge(
    @CurrentUser() user: SessionUser,
    @Body() body: { slugs?: unknown },
  ) {
    return this.wishlist.merge(user.id, body.slugs);
  }

  @Delete(':slug')
  remove(
    @CurrentUser() user: SessionUser,
    @Param('slug') slug: string,
  ) {
    return this.wishlist.remove(user.id, slug);
  }
}
