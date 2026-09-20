import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  }
  return pool;
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Membuat tabel ktp_records & kk_records bila belum ada.
 * Dipanggil otomatis saat app start / request pertama (idempotent).
 */
export async function ensureSchema(): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ktp_records (
      id BIGSERIAL PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      nama TEXT NOT NULL DEFAULT '',
      nik VARCHAR(16) NOT NULL DEFAULT '',
      tempat_lahir TEXT NOT NULL DEFAULT '',
      tgl_lahir VARCHAR(10) NOT NULL DEFAULT '',
      alamat TEXT NOT NULL DEFAULT '',
      rt_rw VARCHAR(16) NOT NULL DEFAULT '',
      kel_desa TEXT NOT NULL DEFAULT '',
      kecamatan TEXT NOT NULL DEFAULT '',
      kabupaten TEXT NOT NULL DEFAULT '',
      provinsi TEXT NOT NULL DEFAULT '',
      agama TEXT NOT NULL DEFAULT '',
      status_perkawinan TEXT NOT NULL DEFAULT '',
      pekerjaan TEXT NOT NULL DEFAULT '',
      confidence REAL,
      needs_review BOOLEAN NOT NULL DEFAULT FALSE,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kk_records (
      id BIGSERIAL PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      no_kk VARCHAR(16) NOT NULL DEFAULT '',
      nama TEXT NOT NULL DEFAULT '',
      nik VARCHAR(16) NOT NULL DEFAULT '',
      jenis_kelamin TEXT NOT NULL DEFAULT '',
      tempat_lahir TEXT NOT NULL DEFAULT '',
      tgl_lahir VARCHAR(10) NOT NULL DEFAULT '',
      alamat TEXT NOT NULL DEFAULT '',
      rt_rw VARCHAR(16) NOT NULL DEFAULT '',
      kel_desa TEXT NOT NULL DEFAULT '',
      kecamatan TEXT NOT NULL DEFAULT '',
      kabupaten TEXT NOT NULL DEFAULT '',
      provinsi TEXT NOT NULL DEFAULT '',
      agama TEXT NOT NULL DEFAULT '',
      status_perkawinan TEXT NOT NULL DEFAULT '',
      pekerjaan TEXT NOT NULL DEFAULT '',
      hubungan_keluarga TEXT NOT NULL DEFAULT '',
      jumlah_istri INTEGER,
      jumlah_anak INTEGER,
      confidence REAL,
      needs_review BOOLEAN NOT NULL DEFAULT FALSE,
      warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_kk_records_no_kk ON kk_records (no_kk)`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_ktp_records_nik ON ktp_records (nik)`
  );
}
