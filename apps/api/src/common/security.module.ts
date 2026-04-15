import { Global, Module } from '@nestjs/common';
import { NonceStoreService } from './services/nonce-store.service';

@Global()
@Module({
  providers: [NonceStoreService],
  exports: [NonceStoreService],
})
export class SecurityModule {}
