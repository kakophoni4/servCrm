import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocKind, OrderStatus, Role } from '@prisma/client';
import { IsEnum } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';
import { DocumentsService } from './documents.service';

const STAFF = [Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER] as const;

class UpdateDocKindDto {
  @IsEnum(DocKind)
  kind!: DocKind;
}

@Controller('orders/:orderId/documents')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(...STAFF)
  @RequirePermissions('documents.read')
  list(@Param('orderId') orderId: string) {
    return this.documents.list(orderId);
  }

  @Post()
  @Roles(...STAFF)
  @RequirePermissions('documents.write')
  @UseInterceptors(FilesInterceptor('files', 30))
  upload(
    @Param('orderId') orderId: string,
    @Query('kind') kind: DocKind,
    @Query('forStatus') forStatus: OrderStatus | undefined,
    @UploadedFiles() files: UploadedMemoryFile[],
    @CurrentUser() user: { userId: string },
  ) {
    return this.documents.uploadMany(
      orderId,
      kind ?? DocKind.CONTRACT,
      files ?? [],
      user.userId,
      forStatus,
    );
  }

  @Get(':docId/download')
  @Roles(...STAFF)
  @RequirePermissions('documents.read')
  async download(
    @Param('orderId') orderId: string,
    @Param('docId') docId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const doc = await this.documents.getDoc(orderId, docId);
    res.set({
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(
        doc.fileName,
      )}`,
    });
    return new StreamableFile(this.storage.stream(doc.filePath));
  }

  @Patch(':docId')
  @Roles(...STAFF)
  @RequirePermissions('documents.write')
  updateKind(
    @Param('orderId') orderId: string,
    @Param('docId') docId: string,
    @Body() dto: UpdateDocKindDto,
  ) {
    return this.documents.updateKind(orderId, docId, dto.kind);
  }

  @Delete(':docId')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  @RequirePermissions('documents.delete')
  remove(@Param('orderId') orderId: string, @Param('docId') docId: string) {
    return this.documents.remove(orderId, docId);
  }
}
