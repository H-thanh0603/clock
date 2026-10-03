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
 * Sniff magic bytes → loại file thật, không tin MIME/ext client khai.
 * Polyglot (file .jpg chứa HTML/JS) hoặc .jpg thực chất là GIF/SVG đều bị
 * chặn ở đây. Không thêm dep: chỉ cần 12 byte đầu.
 */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
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
    // Magic bytes — chặn polyglot/giả MIME (ext + MIME client khai đều giả được).
    const sniffed = sniffImageMime(file.buffer);
    if (!sniffed)
      throw new BadRequestException('File không phải ảnh JPEG/PNG/WebP hợp lệ');
    const key = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
    const stored = await this.storage.put(key, file.buffer, sniffed);
    return { url: stored.url, storage: stored.storage };
  }
}
