import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.read')
  list(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('cityId') cityId?: string,
  ) {
    return this.orders.list(user.userId, user.role, cityId);
  }

  @Get('recent')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.recent')
  recent(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('after') after?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.orders.recent(user.userId, user.role, after, cityId);
  }

  @Get('search')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.read')
  search(
    @CurrentUser() user: { userId: string; role: Role },
    @Query('q') q?: string,
  ) {
    return this.orders.search(user.userId, user.role, q ?? '');
  }

  @Get(':id')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.read')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Post()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.write')
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.orders.create(dto, user.userId, user.role);
  }

  @Patch(':id')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.write')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.orders.update(id, dto, user.userId, user.role);
  }

  @Post(':id/repeat')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.write')
  repeat(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: Role },
  ) {
    return this.orders.createRepeat(id, user.userId, user.role);
  }

  @Post(':id/warranty')
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('orders.write')
  warranty(@Param('id') id: string) {
    return this.orders.markWarranty(id);
  }
}
