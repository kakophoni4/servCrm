import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [StorageService, CryptoService],
  exports: [StorageService, CryptoService],
})
export class StorageModule {}
