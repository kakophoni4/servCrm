import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DocKind, Role } from '@prisma/client';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  StorageService,
  UploadedMemoryFile,
} from '../common/storage/storage.service';
import { DocumentsService } from './documents.service';

const STAFF = [Role.DISPATCHER, Role.ADMIN, Role.DIRECTOR, Role.OWNER] as const;

@Controller('orders/:orderId/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Roles(...STAFF)
  list(@Param('orderId') orderId: string) {
    return this.documents.list(orderId);
  }

  @Post()
  @Roles(...STAFF)
  @UseInterceptors(FilesInterceptor('files', 30))
  upload(
    @Param('orderId') orderId: string,
    @Query('kind') kind: DocKind,
    @UploadedFiles() files: UploadedMemoryFile[],
    @CurrentUser() user: { userId: string },
  ) {
    return this.documents.uploadMany(
      orderId,
      kind ?? DocKind.OTHER,
      files ?? [],
      user.userId,
    );
  }

  @Get(':docId/download')
  @Roles(...STAFF)
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

  @Delete(':docId')
  @Roles(Role.ADMIN, Role.DIRECTOR, Role.OWNER)
  remove(@Param('orderId') orderId: string, @Param('docId') docId: string) {
    return this.documents.remove(orderId, docId);
  }
}
