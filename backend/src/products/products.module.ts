import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [SearchModule],
  providers: [ProductsService],
  controllers: [ProductsController],
  // AdminModule import module này để AdminService inject ProductsService —
  // thiếu exports thì Nest DI không resolve được dependency đó.
  exports: [ProductsService],
})
export class ProductsModule {}
