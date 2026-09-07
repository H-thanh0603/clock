import { Global, Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';

@Global()
@Module({
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
