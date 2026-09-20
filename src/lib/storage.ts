import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { extForMime, type SupportedMime } from "./detect";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "warga-scan-uploads";

export type StorageBackend = "supabase" | "disk";

export interface StoredFile {
  url: string;
  backend: StorageBackend;
  /** Path/nama objek di bucket (supabase) atau nama file di disk (disk). */
  objectPath: string;
}

function supabaseEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceKey };
}

let cachedClient: SupabaseClient | null = null;
let bucketReady = false;

/** Client Supabase sisi server (service role) — null jika env belum lengkap. */
function getSupabaseAdmin(): SupabaseClient | null {
  const { url, serviceKey } = supabaseEnv();
  if (!url || !serviceKey) return null;
  if (!cachedClient) {
    cachedClient = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}

export function isSupabaseStorageConfigured(): boolean {
  return getSupabaseAdmin() !== null;
}

/** Pastikan bucket upload tersedia (idempotent). */
export async function ensureBucket(): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  // Bucket yang sudah ada dianggap sukses.
  if (error && !String(error.message).toLowerCase().includes("exist")) {
    throw error;
  }
}

/**
 * Simpan file upload.
 * - Jika Supabase dikonfigurasi → upload ke Storage bucket, return public URL.
 * - Jika tidak → fallback simpan ke disk lokal (mode dev).
 */
export async function saveUpload(buf: Buffer, mime: SupportedMime): Promise<StoredFile> {
  const fileName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extForMime(mime)}`;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    if (!bucketReady) {
      await ensureBucket();
      bucketReady = true;
    }
    const { error } = await supabase.storage.from(BUCKET).upload(fileName, buf, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    return { url: data.publicUrl, backend: "supabase", objectPath: fileName };
  }

  // Fallback: disk lokal
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, fileName), buf);
  return { url: `/api/uploads/${fileName}`, backend: "disk", objectPath: fileName };
}

/** Hapus file fisik (best-effort, tidak melempar error). */
export async function deleteUpload(file: { backend: StorageBackend; objectPath?: string }): Promise<void> {
  try {
    if (file.backend === "supabase" && file.objectPath) {
      const supabase = getSupabaseAdmin();
      if (supabase) await supabase.storage.from(BUCKET).remove([file.objectPath]);
      return;
    }
    if (file.objectPath) {
      const abs = resolveUploadPath(file.objectPath);
      if (abs) await unlink(abs);
    }
  } catch (err) {
    console.error("Gagal menghapus file:", err);
  }
}

/** Ambil path absolut file di disk; tolak path traversal. */
export function resolveUploadPath(fileName: string): string | null {
  if (!/^[\w.\-() ]+$/.test(fileName)) return null;
  const abs = path.join(UPLOAD_DIR, fileName);
  if (!abs.startsWith(UPLOAD_DIR)) return null;
  return abs;
}
