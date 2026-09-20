/**
 * Test insert nyata: perhitungan istri/suami/anak per anggota + cleanup.
 * Jalankan: npx tsx --env-file=.env.local scripts/insert-rules-test.mjs
 */
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { insertKkMembers } from "../src/lib/records.ts";
import { extractDocument } from "../src/lib/ai.ts";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

try {
  const buf = await readFile("kk/KK TERBARU 001 (1).jpg");
  const r = await extractDocument("image/jpeg", buf.toString("base64"));
  if (!r.kk) {
    console.log("KK tidak terdeteksi:", r.doc_type);
    process.exit(1);
  }
  const rows = await insertKkMembers(
    pool,
    { fileName: "TEST-UJI.jpg", fileUrl: "test", fileBackend: "disk", filePath: "test" },
    r.kk, 0.99, []
  );
  console.log("Hasil insert per anggota:");
  for (const row of rows) {
    console.log(
      `  ${row.hubungan_keluarga.padEnd(16)} | istri: ${row.jumlah_istri} | suami: ${row.jumlah_suami} | anak: ${row.jumlah_anak}`
    );
  }
  const ids = rows.map((x) => Number(x.id));
  await pool.query("DELETE FROM kk_records WHERE id = ANY($1::int[])", ["{" + ids.join(",") + "}"]);
  console.log("data uji dihapus OK");
} finally {
  await pool.end();
}
