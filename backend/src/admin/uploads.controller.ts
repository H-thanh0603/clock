import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { extname } from 'path';
import { AdminGuard } from '../common/guards';
import { StorageService } from '../common/storage.service';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Chuẩn hóa extension từ tên file gốc. Mimetype client gửi lên giả được
 * nên phải check cả ext — không whitelist thì file .html/.svg (JS bên
 * trong) sẽ lưu và serve từ /uploads/ → stored XSS trên origin backend.
 * Trả null nếu ext không cho phép.
 */
export function resolveUploadExt(originalname: string): string | null {
  const ext = extname(originalname ?? '').toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : null;
}

/**
 * Upload ảnh sản phẩm cho admin. StorageService tự chọn S3-compatible
 * (S3_BUCKET cấu hình) hoặc disk fallback — API giữ nguyên cho FE.
 */
@Controller('admin/uploads')
@UseGuards(AdminGuard)
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @HttpCode(201)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
        else
          cb(
            new BadRequestException(
              'Chỉ nhận ảnh JPEG/PNG/WebP (tối đa 5MB)',
            ),
            false,
          );
      },
    }),
  )
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Thiếu file ảnh');
    const ext = resolveUploadExt(file.originalname);
    if (!ext) {
      throw new BadRequestException(
        'Đuôi file không hợp lệ (chỉ .jpg/.jpeg/.png/.webp)',
      );
    }
    const key = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    const stored = await this.storage.put(key, file.buffer, file.mimetype);
    return { url: stored.url, storage: stored.storage };
  }
}
