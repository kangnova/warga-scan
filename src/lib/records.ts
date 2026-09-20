import type { Pool } from "pg";
import type { KkExtraction, KkRecord } from "./types";

const KK_COLUMNS = `(
  file_name, file_url, file_backend, file_path,
  no_kk, nama, nik, jenis_kelamin, tempat_lahir, tgl_lahir,
  alamat, rt_rw, kel_desa, kecamatan, kabupaten, provinsi,
  agama, status_perkawinan, pekerjaan, hubungan_keluarga,
  jumlah_istri, jumlah_anak, confidence, needs_review, warnings
)`;

export interface KkFileMeta {
  fileName: string;
  fileUrl: string;
  fileBackend: "supabase" | "disk";
  filePath: string;
}

/** Normalisasi nama untuk pencocokan: huruf kecil, tanpa tanda baca/diakritik. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cocokkan target ke nama anggota (substring, case-insensitive). */
export function nameMatches(target: string, nama: string): boolean {
  const t = normalizeName(target);
  if (!t) return false;
  const n = normalizeName(nama);
  return n.includes(t);
}

/** Insert anggota KK terpilih (default: semua) sebagai baris kk_records. */
export async function insertKkMembers(
  pool: Pool,
  meta: KkFileMeta,
  kk: KkExtraction,
  confidence: number,
  warnings: string[],
  selected?: number[]
): Promise<KkRecord[]> {
  const members = kk.anggota
    .map((m, i) => ({ m, i }))
    .filter(({ i }) => !selected || selected.includes(i))
    .map(({ m }) => m);

  const warns = JSON.stringify(warnings);
  const needsReview = confidence < 0.7 || warnings.length > 0;
  const rows: KkRecord[] = [];

  for (const m of members) {
    const ins = await pool.query(
      `INSERT INTO kk_records ${KK_COLUMNS}
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb)
       RETURNING *`,
      [meta.fileName, meta.fileUrl, meta.fileBackend, meta.filePath,
       kk.no_kk, m.nama, m.nik, m.jenis_kelamin, m.tempat_lahir, m.tgl_lahir,
       kk.alamat, kk.rt_rw, kk.kel_desa, kk.kecamatan, kk.kabupaten, kk.provinsi,
       m.agama, m.status_perkawinan, m.pekerjaan, m.hubungan_keluarga,
       kk.jumlah_istri, kk.jumlah_anak, confidence, needsReview, warns]
    );
    rows.push(ins.rows[0] as KkRecord);
  }
  return rows;
}
