import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Controller('api/uploads')
export class UploadsController {
  @Post('product-image')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'editor')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination(_req, _file, cb) {
          const dest = path.join(process.cwd(), 'uploads', 'products', 'tmp');
          fs.mkdirSync(dest, { recursive: true });
          cb(null, dest);
        },
        filename(_req, file, cb) {
          const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
          cb(null, `${uuidv4()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter(_req, file, cb) {
        if (ALLOWED_MIME.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only JPEG, PNG and WEBP images are accepted'), false);
        }
      },
    }),
  )
  uploadProductImage(
    @UploadedFile() file: Express.Multer.File | undefined,
  ): { url: string } {
    if (!file) {
      throw new BadRequestException('No valid image file provided');
    }
    return { url: `/uploads/products/tmp/${file.filename}` };
  }
}
