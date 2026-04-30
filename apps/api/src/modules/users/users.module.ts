import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TraderWalletsModule } from '../trader-wallets/trader-wallets.module';

@Module({
  imports: [TraderWalletsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
