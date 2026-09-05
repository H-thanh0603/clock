import { Global, Module } from '@nestjs/common';
import {
  AdminGuard,
  OptionalSessionGuard,
  RequiredAuthGuard,
} from './guards';

/** Guards dùng chung — @Global để @UseGuards resolve được DI ở mọi module. */
@Global()
@Module({
  providers: [OptionalSessionGuard, RequiredAuthGuard, AdminGuard],
  exports: [OptionalSessionGuard, RequiredAuthGuard, AdminGuard],
})
export class GuardsModule {}
