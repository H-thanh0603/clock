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
import { Throttle } from '@nestjs/throttler';
import { WishlistService } from './wishlist.service';
import { RequiredAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

@Controller('wishlist')
@UseGuards(RequiredAuthGuard)
// Merge spam (local-store sync) throttle riêng — global 200/phút quá rộng.
@Throttle({ default: { limit: 20, ttl: 60_000 } })
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
