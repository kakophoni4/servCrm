import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ChatModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
