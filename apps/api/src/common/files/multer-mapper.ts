import type { UploadedFile } from '../../modules/files/files.service';

/**
 * Normalize the subset of multer `Express.Multer.File` fields we forward to the file storage layer.
 * Centralized so every multipart endpoint maps the same fields (`originalname`, `mimetype`, `size`, `buffer`).
 */
export function mapUploadedFiles(
  files: Express.Multer.File[] | undefined,
): UploadedFile[] {
  return (files ?? []).map((f) => ({
    originalname: f.originalname,
    mimetype: f.mimetype,
    size: f.size,
    buffer: f.buffer,
  }));
}
