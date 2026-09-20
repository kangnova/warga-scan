import type { Pool } from "pg";
import type { KkExtraction, KkMember, KkRecord } from "./types";

const KK_COLUMNS = `(
  file_name, file_url, file_backend, file_path,
  no_kk, nama, nik, jenis_kelamin, tempat_lahir, tgl_lahir,
  alamat, rt_rw, kel_desa, kecamatan, kabupaten, provinsi,
  agama, status_perkawinan, pekerjaan, hubungan_keluarga,
  jumlah_istri, jumlah_suami, jumlah_anak, confidence, needs_review, warnings
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

export type KkRole = "kepala" | "suami" | "istri" | "anak" | "other";

/**
 * Klasifikasi hubungan keluarga. Catatan: di dokumen KK resmi tertulis
 * "ISTERI" (bukan "ISTRI"), keduanya ditangani di sini.
 */
export function kkRole(hubunganKel: string): KkRole {
  const h = hubunganKel.toUpperCase().trim();
  if (h.startsWith("ISTRI") || h.startsWith("ISTERI")) return "istri";
  if (h.startsWith("ANAK")) return "anak";
  if (h.startsWith("KEPALA KELUARGA")) return "kepala";
  if (h.startsWith("SUAMI")) return "suami";
  return "other";
}

export interface KkHouseholdCounts {
  jumlah_istri: number;
  jumlah_suami: number;
  jumlah_anak: number;
}

/**
 * Hitungan household global dari daftar anggota.
 * - istri  : anggota dengan hubungan ISTRi/ISTERI
 * - suami  : anggota KEPALA KELUARGA + SUAMI (bisa >1, dijumlahkan)
 * - anak   : anggota dengan hubungan diawali ANAK (termasuk anak sambung/angkat)
 */
export function kkHouseholdCounts(kk: KkExtraction): KkHouseholdCounts {
  const roles = kk.anggota.map((m) => kkRole(m.hubungan_keluarga));
  return {
    jumlah_istri: roles.filter((r) => r === "istri").length,
    jumlah_suami: roles.filter((r) => r === "kepala" || r === "suami").length,
    jumlah_anak: roles.filter((r) => r === "anak").length,
  };
}

/**
 * Nilai kolom jumlah untuk SATU baris anggota, sesuai aturan:
 * - Kepala Keluarga : istri = jumlah istri, suami = 0 (kepala bukan "suami"),
 *                     anak = jumlah anak
 * - Suami           : istri = jumlah istri (1, dijumlahkan bila >1), suami = 0
 * - Istri           : istri = 0, suami = jumlah kepala/suami (suaminya),
 *                     anak = jumlah anak
 * - Anak            : istri = 0, suami = 0, anak = 0
 */
export function kkCountsFor(kk: KkExtraction, member: KkMember): KkHouseholdCounts {
  const { jumlah_istri: wives, jumlah_suami: husbands, jumlah_anak: anak } = kkHouseholdCounts(kk);
  switch (kkRole(member.hubungan_keluarga)) {
    case "kepala":
      return { jumlah_istri: wives, jumlah_suami: 0, jumlah_anak: anak };
    case "suami":
      return { jumlah_istri: wives, jumlah_suami: 0, jumlah_anak: anak };
    case "istri":
      return { jumlah_istri: 0, jumlah_suami: husbands, jumlah_anak: anak };
    case "anak":
      return { jumlah_istri: 0, jumlah_suami: 0, jumlah_anak: 0 };
    default:
      return { jumlah_istri: wives, jumlah_suami: husbands, jumlah_anak: anak };
  }
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
    // Nilai jumlah dihitung deterministik dari hubungan keluarga (bukan dari
    // tebakan AI). Fallback ke angka AI hanya bila daftar anggota kosong.
    const counts = kk.anggota.length > 0
      ? kkCountsFor(kk, m)
      : { jumlah_istri: kk.jumlah_istri, jumlah_suami: 0, jumlah_anak: kk.jumlah_anak };

    const ins = await pool.query(
      `INSERT INTO kk_records ${KK_COLUMNS}
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb)
       RETURNING *`,
      [meta.fileName, meta.fileUrl, meta.fileBackend, meta.filePath,
       kk.no_kk, m.nama, m.nik, m.jenis_kelamin, m.tempat_lahir, m.tgl_lahir,
       kk.alamat, kk.rt_rw, kk.kel_desa, kk.kecamatan, kk.kabupaten, kk.provinsi,
       m.agama, m.status_perkawinan, m.pekerjaan, m.hubungan_keluarga,
       counts.jumlah_istri, counts.jumlah_suami, counts.jumlah_anak,
       confidence, needsReview, warns]
    );
    rows.push(ins.rows[0] as KkRecord);
  }
  return rows;
}
