import { Injectable } from '@nestjs/common';
import { AdminOrdersService } from './admin-orders.service';
import { AdminCustomersService } from './admin-customers.service';
import { AdminListingsService } from './admin-listings.service';
import { AdminPromotionsService } from './admin-promotions.service';
import { AdminCampaignsService } from './admin-campaigns.service';
import { AdminFinanceService } from './admin-finance.service';

// Re-export cho test/convention cũ — seam thật nằm ở 6 service con.
export { productDiff } from './product-audit';
export type { DiffValue } from './product-audit';

/**
 * Facade backoffice — giữ nguyên shape cho AdminController (không đổi
 * dòng controller nào). Logic thật nằm ở 6 service theo domain CONTEXT.md:
 * Orders / Customers / Listings / Promotions / Campaigns / Finance.
 *
 * Vì sao không xóa facade: controller + test + promotion-expire đều gọi
 * qua 1 điểm; facade mỏng (delegate thuần) nên giữ để migration từng bước.
 * Khi nào controller inject trực tiếp 6 service thì xóa file này.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly orders: AdminOrdersService,
    private readonly customers: AdminCustomersService,
    private readonly listings: AdminListingsService,
    private readonly promotions: AdminPromotionsService,
    private readonly campaigns: AdminCampaignsService,
    private readonly finance: AdminFinanceService,
  ) {}

  // -- Order (AdminOrdersService) --

  list(status?: string, page = 1, limit = 20) {
    return this.orders.list(status, page, limit);
  }

  updateStatus(
    id: string,
    status: string,
    byUserId?: string,
    opts: { refundRef?: string; paymentRef?: string; note?: string } = {},
  ) {
    return this.orders.updateStatus(id, status, byUserId, opts);
  }

  stats() {
    return this.orders.stats();
  }

  // -- Customer (AdminCustomersService) --

  listUsers(page = 1, limit = 20) {
    return this.customers.listUsers(page, limit);
  }

  userDetail(id: string) {
    return this.customers.userDetail(id);
  }

  // -- Listing (AdminListingsService) --

  listProducts(page = 1, limit = 20, q?: string, includeHidden = true) {
    return this.listings.listProducts(page, limit, q, includeHidden);
  }

  createProduct(body: Record<string, unknown>, byUserId?: string) {
    return this.listings.createProduct(body, byUserId);
  }

  updateProduct(slug: string, body: Record<string, unknown>, byUserId?: string) {
    return this.listings.updateProduct(slug, body, byUserId);
  }

  productEvents(slug: string) {
    return this.listings.productEvents(slug);
  }

  // -- Promotion (AdminPromotionsService) --

  listPromotions(active?: boolean) {
    return this.promotions.listPromotions(active);
  }

  createPromotion(
    body: {
      name?: unknown;
      listingSlugs?: unknown;
      discountPct?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    },
    byUserId?: string,
  ) {
    return this.promotions.createPromotion(body, byUserId);
  }

  setPromotionActive(id: string, active: boolean) {
    return this.promotions.setPromotionActive(id, active);
  }

  closePromotion(id: string, reason: string) {
    return this.promotions.closePromotion(id, reason);
  }

  // -- Campaign (AdminCampaignsService) --

  listCampaigns(status?: string) {
    return this.campaigns.listCampaigns(status);
  }

  createCampaign(
    body: {
      name?: unknown;
      objective?: unknown;
      audience?: unknown;
      budgetUsd?: unknown;
      copyText?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
    },
    byUserId?: string,
  ) {
    return this.campaigns.createCampaign(body, byUserId);
  }

  updateCampaign(id: string, body: Record<string, unknown>) {
    return this.campaigns.updateCampaign(id, body);
  }

  // -- Finance (AdminFinanceService) --

  metrics(metric: string, granularity = 'day', days = 30) {
    return this.finance.metrics(metric, granularity, days);
  }

  listInvoices(status?: string, page = 1, limit = 20) {
    return this.finance.listInvoices(status, page, limit);
  }

  setInvoiceStatus(
    id: string,
    body: { status?: string; number?: string; externalRef?: string },
    byUserId?: string,
  ) {
    return this.finance.setInvoiceStatus(id, body, byUserId);
  }

  retryInvoice(id: string) {
    return this.finance.retryInvoice(id);
  }
}
