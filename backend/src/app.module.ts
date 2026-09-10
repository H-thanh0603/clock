import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { GuardsModule } from './common/guards.module';
import { CsrfMiddleware } from './common/csrf.middleware';
import {
  RequestIdMiddleware,
  captureException,
} from './common/observability';
import { SentryAllExceptionsFilter } from './common/sentry-exception.filter';
import { HealthController } from './health.controller';
import { NotifyModule } from './notify/notify.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';
import { PaymentsModule } from './payments/payments.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { InvoiceModule } from './invoices/invoice.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    GuardsModule,
    NotifyModule,
    AuthModule,
    ProductsModule,
    CartModule,
    OrdersModule,
    AdminModule,
    PaymentsModule,
    WishlistModule,
    InquiriesModule,
    InvoiceModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Mọi exception 5xx/chưa xử lý → Sentry + log kèm request-id.
    { provide: APP_FILTER, useClass: SentryAllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, CsrfMiddleware).forRoutes('*');
  }
}
