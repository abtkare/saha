import { Controller, HttpCode, Injectable, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, normalize } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/arabic-error.filter';
import { AuthGuard, assertActive } from '../auth/auth.guard';
import { clientIp, type AuthedRequest } from '../auth/auth.types';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_UPLOADS_PER_HOUR = 30;

/** ملف من multer (ذاكرة) */
interface IncomingFile { buffer: Buffer; size: number; mimetype: string; originalname: string }

const storageDir = () => process.env.STORAGE_DIR || join(tmpdir(), 'saha-uploads');

/** نوع الصورة من أول بايتات الملف (لا نثق باسم الملف ولا بالنوع المرسل) */
export function sniffImage(b: Buffer): { mime: string; ext: string } | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * طبقة التخزين: مجلد على السيرفر (STORAGE_DIR) — تُستبدل بـ S3 لاحقاً دون تغيير من يستدعيها.
 * الصور فقط (JPEG/PNG/WebP) حتى 5MB. التحويل إلى WebP مؤجل حتى تُضاف مكتبة الصور.
 */
@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async save(file: IncomingFile | undefined, userId: number, ip: string) {
    if (!file?.buffer?.length) throw new AppError(400, 'FILE_REQUIRED', 'أرفق صورة في الحقل file.');
    if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'حجم الصورة أكبر من 5 ميغابايت.');
    const kind = sniffImage(file.buffer);
    if (!kind) throw new AppError(400, 'NOT_AN_IMAGE', 'الملف ليس صورة مدعومة (JPEG أو PNG أو WebP).');
    const recent = await this.prisma.mediaAsset.count({ where: { uploadedById: userId, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
    if (recent >= MAX_UPLOADS_PER_HOUR) throw new AppError(429, 'UPLOAD_LIMIT', 'رفعت صوراً كثيرة خلال ساعة. حاول لاحقاً.');

    const now = new Date();
    const rel = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${kind.ext}`;
    const abs = join(storageDir(), rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.buffer, { flag: 'wx' });
    const asset = await this.prisma.mediaAsset.create({ data: { path: rel, mime: kind.mime, sizeBytes: file.size, uploadedById: userId } });
    await this.audit.record({ actorUserId: userId, action: 'media.upload', entity: 'media_asset', entityId: asset.id, payload: { mime: kind.mime, sizeBytes: file.size }, ip });
    return { id: asset.id, mime: asset.mime, sizeBytes: asset.sizeBytes, createdAt: asset.createdAt };
  }

  async read(id: number) {
    const a = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!a) throw new AppError(404, 'MEDIA_NOT_FOUND', 'الصورة غير موجودة.');
    const rel = normalize(a.path);
    if (rel.startsWith('..') || rel.startsWith('/')) throw new AppError(404, 'MEDIA_NOT_FOUND', 'الصورة غير موجودة.');
    try {
      return { mime: a.mime, data: await readFile(join(storageDir(), rel)) };
    } catch {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'ملف الصورة غير موجود على الخادم.');
    }
  }
}

@Controller('uploads')
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** POST /uploads — multipart/form-data بحقل file (صورة واحدة حتى 5MB) */
  @Post() @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@UploadedFile() file: IncomingFile | undefined, @Req() req: AuthedRequest) {
    assertActive(req.auth);
    return this.uploads.save(file, req.auth.userId, clientIp(req));
  }
}
