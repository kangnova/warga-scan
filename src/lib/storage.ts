import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extForMime, type SupportedMime } from "./detect";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** Simpan file upload ke folder uploads/ dan return path publiknya. */
export async function saveUpload(buf: Buffer, mime: SupportedMime): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const unique = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extForMime(mime)}`;
  await writeFile(path.join(UPLOAD_DIR, unique), buf);
  return `/api/uploads/${unique}`;
}

/** Ambil path absolut file upload; tolak path traversal. */
export function resolveUploadPath(fileName: string): string | null {
  if (!/^[\w.\-() ]+$/.test(fileName)) return null;
  const abs = path.join(UPLOAD_DIR, fileName);
  if (!abs.startsWith(UPLOAD_DIR)) return null;
  return abs;
}
