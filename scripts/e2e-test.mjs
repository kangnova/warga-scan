/**
 * E2E test: ekstraksi AI + Supabase Storage + insert DB
 * Jalankan: node --env-file=.env.local scripts/e2e-test.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractDocument } from "../src/lib/ai.ts";
import { saveUpload } from "../src/lib/storage.ts";
import { Pool } from "pg";

const SAMPLES = [
  { file: "ktp/KTP BELAKANG.PNG", mime: "image/png", label: "KTP" },
  { file: "kk/KK TERBARU 001 (1).jpg", mime: "image/jpeg", label: "KK" },
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

try {
  for (const s of SAMPLES) {
    console.log(`\n========== ${s.label}: ${s.file} ==========`);
    const buf = await readFile(path.resolve(s.file));

    // 1. Ekstraksi AI
    const result = await extractDocument(s.mime, buf.toString("base64"));
    console.log("doc_type:", result.doc_type, "| confidence:", result.confidence);
    console.log("warnings:", result.warnings);

    // 2. Upload ke storage (Supabase atau disk)
    const stored = await saveUpload(buf, s.mime);
    console.log("storage backend:", stored.backend, "| url:", stored.url.slice(0, 80));

    // 3. Insert ke DB sesuai jenis dokumen
    if (result.doc_type === "KTP" && result.ktp) {
      const k = result.ktp;
      console.log("NIK:", k.nik || "(kosong)", "| Nama:", k.nama || "(kosong)");
      await pool.query(
        `INSERT INTO ktp_records (file_name, file_url, file_backend, file_path, nama, nik, tempat_lahir, tgl_lahir, alamat, rt_rw, kel_desa, kecamatan, kabupaten, provinsi, agama, status_perkawinan, pekerjaan, confidence, needs_review, warnings)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb)`,
        [s.file, stored.url, stored.backend, stored.objectPath, k.nama, k.nik, k.tempat_lahir, k.tgl_lahir, k.alamat, k.rt_rw, k.kel_desa, k.kecamatan, k.kabupaten, k.provinsi, k.agama, k.status_perkawinan, k.pekerjaan, result.confidence, result.warnings.length > 0, JSON.stringify(result.warnings)]
      );
      console.log("-> INSERT ktp_records OK");
    } else if (result.doc_type === "KK" && result.kk) {
      const kk = result.kk;
      console.log("No.KK:", kk.no_kk || "(kosong)", "| istri:", kk.jumlah_istri, "| anak:", kk.jumlah_anak, "| anggota:", kk.anggota.length);
      for (const m of kk.anggota) {
        console.log("   -", m.nama || "(kosong)", "|", m.hubungan_keluarga, "| NIK:", m.nik || "(kosong)");
        await pool.query(
          `INSERT INTO kk_records (file_name, file_url, file_backend, file_path, no_kk, nama, nik, jenis_kelamin, tempat_lahir, tgl_lahir, alamat, rt_rw, kel_desa, kecamatan, kabupaten, provinsi, agama, status_perkawinan, pekerjaan, hubungan_keluarga, jumlah_istri, jumlah_anak, confidence, needs_review, warnings)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb)`,
          [s.file, stored.url, stored.backend, stored.objectPath, kk.no_kk, m.nama, m.nik, m.jenis_kelamin, m.tempat_lahir, m.tgl_lahir, kk.alamat, kk.rt_rw, kk.kel_desa, kk.kecamatan, kk.kabupaten, kk.provinsi, m.agama, m.status_perkawinan, m.pekerjaan, m.hubungan_keluarga, kk.jumlah_istri, kk.jumlah_anak, result.confidence, result.warnings.length > 0, JSON.stringify(result.warnings)]
        );
      }
      console.log(`-> INSERT ${kk.anggota.length} rows ke kk_records OK`);
    } else {
      console.log("-> Dokumen tidak dikenali (tidak diinsert)");
    }
  }

  const c1 = await pool.query("SELECT COUNT(*)::int n FROM ktp_records");
  const c2 = await pool.query("SELECT COUNT(*)::int n FROM kk_records");
  console.log(`\n===== TOTAL di DB: ktp_records=${c1.rows[0].n} | kk_records=${c2.rows[0].n} =====`);
} finally {
  await pool.end();
}
