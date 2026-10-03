import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminOrdersService } from './admin-orders.service';
import { AdminCustomersService } from './admin-customers.service';
import { AdminListingsService } from './admin-listings.service';
import { AdminPromotionsService } from './admin-promotions.service';
import { AdminCampaignsService } from './admin-campaigns.service';
import { AdminFinanceService } from './admin-finance.service';
import { AdminController } from './admin.controller';
import { UploadsController } from './uploads.controller';
import { StorageService } from '../common/storage.service';
import { ProductsModule } from '../products/products.module';
import { SearchModule } from '../search/search.module';
import { InvoiceModule } from '../invoices/invoice.module';
import { AgentShopperCleanupService } from '../agents/agent-shopper-cleanup.service';
import { PromotionExpireService } from './promotion-expire.service';

@Module({
  // Listings dùng ProductsService.list + Meili sync; Finance dùng InvoiceService.
  imports: [ProductsModule, SearchModule, InvoiceModule],
  providers: [
    AdminService,
    AdminOrdersService,
    AdminCustomersService,
    AdminListingsService,
    AdminPromotionsService,
    AdminCampaignsService,
    AdminFinanceService,
    StorageService,
    AgentShopperCleanupService,
    PromotionExpireService,
  ],
  controllers: [AdminController, UploadsController],
})
export class AdminModule {}
