import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaCartStorage } from '../common/cart-storage';
import {
  addToCart,
  clearCart,
  getCart,
  mergeGuestCart,
  removeFromCart,
  updateCartQty,
} from '../common/cart';
import { RequiredAuthGuard } from '../common/guards';
import { CurrentUser } from '../common/current-user.decorator';
import type { SessionUser } from '../common/session';

@Controller('cart')
@UseGuards(RequiredAuthGuard)
export class CartController {
  constructor(private readonly storage: PrismaCartStorage) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return getCart(this.storage, user.id);
  }

  @Post('merge')
  @HttpCode(200)
  merge(
    @CurrentUser() user: SessionUser,
    @Body() body: { items?: unknown },
  ) {
    return mergeGuestCart(this.storage, user.id, body.items);
  }

  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: SessionUser,
    @Body()
    body: {
      productSlug?: string;
      slug?: string;
      name: string;
      priceUsd: number;
      image: string;
      strap?: string;
      engraving?: string;
      qty?: number;
    },
  ) {
    const outcome = await addToCart(this.storage, user.id, {
      slug: body.productSlug ?? body.slug,
      name: body.name,
      priceUsd: body.priceUsd,
      image: body.image,
      strap: body.strap,
      engraving: body.engraving,
      qty: body.qty,
    });
    if (!outcome.ok) throw new BadRequestException(outcome.error);
    return outcome.items;
  }

  @Patch()
  @HttpCode(200)
  async update(
    @CurrentUser() user: SessionUser,
    @Body() body: { slug?: string; strap?: string; qty?: number },
  ) {
    const outcome = await updateCartQty(this.storage, user.id, body);
    if (!outcome.ok) throw new BadRequestException(outcome.error);
    return outcome.items;
  }

  @Delete()
  async remove(
    @CurrentUser() user: SessionUser,
    @Query('clear') clear?: string,
    @Query('slug') slug?: string,
    @Query('strap') strap?: string,
  ) {
    if (clear === '1') return clearCart(this.storage, user.id);
    const outcome = await removeFromCart(this.storage, user.id, {
      slug: slug ?? undefined,
      strap: strap ?? undefined,
    });
    if (!outcome.ok) throw new BadRequestException(outcome.error);
    return outcome.items;
  }
}
