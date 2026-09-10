import { Controller, Get, Param, Query } from '@nestjs/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('collection') collection?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('movements') movements?: string,
    @Query('material') material?: string,
    @Query('size') size?: string,
    @Query('complications') complications?: string,
  ) {
    return this.products.list({
      q,
      collection,
      sort: (sort as 'featured' | 'price-asc' | 'price-desc' | 'newest') || 'featured',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      // Multi-value qua CSV: movements=tourbillon,chrono
      movements: movements?.split(',').map((s) => s.trim()).filter(Boolean),
      material,
      size,
      complications: complications?.split(',').map((s) => s.trim()).filter(Boolean),
    });
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.products.bySlug(slug);
  }
}
