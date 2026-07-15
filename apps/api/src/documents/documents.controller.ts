import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DocKind, Role } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { DocumentsService } from './documents.service';

class CreateDocDto {
  @IsEnum(DocKind)
  kind!: DocKind;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  filePath!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;
}

@Controller('orders/:orderId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  list(@Param('orderId') orderId: string) {
    return this.documents.list(orderId);
  }

  @Post()
  @Roles(Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  create(
    @Param('orderId') orderId: string,
    @Body() dto: CreateDocDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.documents.create(orderId, {
      ...dto,
      uploadedBy: user.userId,
    });
  }
}
