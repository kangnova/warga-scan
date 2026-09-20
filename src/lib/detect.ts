export type SupportedMime = "image/jpeg" | "image/png" | "application/pdf";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function detectMime(buf: Buffer): SupportedMime | null {
  if (buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)
    return "application/pdf";
  return null;
}

export function extForMime(mime: SupportedMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  return "pdf";
}

export function sanitizeFileName(name: string): string {
  const base = name.replace(/[^\w.\-() ]+/g, "_").replace(/\s+/g, " ").trim();
  return (base || "dokumen").slice(0, 120);
}
