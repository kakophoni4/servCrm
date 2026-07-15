import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ClientsService } from './clients.service';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list(@Query('phone') phone?: string) {
    if (phone) return this.clients.search(phone);
    return this.clients.list();
  }

  @Get(':id')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  get(@Param('id') id: string) {
    return this.clients.get(id);
  }

  @Patch(':id/comment')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  updateComment(
    @Param('id') id: string,
    @Body() body: { branchComment: string },
  ) {
    return this.clients.updateComment(id, body.branchComment);
  }
}
