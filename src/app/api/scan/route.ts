import { NextResponse } from "next/server";
import { detectMime, MAX_FILE_SIZE, sanitizeFileName } from "@/lib/detect";
import { extractDocument, isAiConfigured } from "@/lib/ai";
import { renderPdfPages } from "@/lib/pdf";
import { saveUpload } from "@/lib/storage";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db";
import type { ExtractionResult, KkRecord, KtpRecord, ScanResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const KTP_COLUMNS = `(
  file_name, file_url, nama, nik, tempat_lahir, tgl_lahir, alamat, rt_rw,
  kel_desa, kecamatan, kabupaten, provinsi, agama, status_perkawinan, pekerjaan,
  confidence, needs_review, warnings
)`;

const KK_COLUMNS = `(
  file_name, file_url, no_kk, nama, nik, jenis_kelamin, tempat_lahir, tgl_lahir,
  alamat, rt_rw, kel_desa, kecamatan, kabupaten, provinsi,
  agama, status_perkawinan, pekerjaan, hubungan_keluarga,
  jumlah_istri, jumlah_anak, confidence, needs_review, warnings
)`;

export async function POST(req: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY belum diset di .env.local." } satisfies ScanResponse,
      { status: 503 }
    );
  }

  let file: File;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (!(f instanceof File)) throw new Error("no file");
    file = f;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request tidak valid: file tidak ditemukan." } satisfies ScanResponse,
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "File kosong." } satisfies ScanResponse, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { ok: false, error: "Ukuran file maksimal 10MB." } satisfies ScanResponse,
      { status: 413 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(buf);
  if (!mime) {
    return NextResponse.json(
      { ok: false, error: "Format file tidak didukung. Gunakan JPG, PNG, atau PDF." } satisfies ScanResponse,
      { status: 415 }
    );
  }

  // Simpan file asli lebih dulu agar tetap bisa ditampilkan walau ekstraksi gagal.
  const fileName = sanitizeFileName(file.name);
  let fileUrl: string;
  try {
    fileUrl = await saveUpload(buf, mime);
  } catch (err) {
    console.error("Gagal menyimpan upload:", err);
    return NextResponse.json({ ok: false, error: "Gagal menyimpan file." } satisfies ScanResponse, { status: 500 });
  }

  // Siapkan gambar untuk AI: gambar → langsung; PDF → render jadi PNG per halaman.
  let images: { mime: string; base64: string }[];
  if (mime === "application/pdf") {
    try {
      images = await renderPdfPages(buf);
    } catch (err) {
      console.error("Gagal merender PDF:", err);
      return NextResponse.json(
        { ok: false, error: "Gagal membaca PDF. Kemungkinan file rusak atau terproteksi." } satisfies ScanResponse,
        { status: 422 }
      );
    }
    if (images.length === 0) {
      return NextResponse.json({ ok: false, error: "PDF tidak memiliki halaman." } satisfies ScanResponse, { status: 422 });
    }
  } else {
    images = [{ mime, base64: buf.toString("base64") }];
  }

  // Ekstraksi per halaman sampai dokumen dikenali.
  let result: ExtractionResult | null = null;
  let lastError: unknown = null;
  for (const img of images) {
    try {
      const r = await extractDocument(img.mime, img.base64);
      if (r.doc_type !== "UNKNOWN") {
        result = r;
        break;
      }
      result = r;
    } catch (err) {
      lastError = err;
    }
  }

  if (!result || result.doc_type === "UNKNOWN") {
    if (!result && lastError) {
      console.error("Gemini error:", lastError);
      return NextResponse.json(
        { ok: false, error: "Gagal memproses dengan AI. Cek GEMINI_API_KEY / kuota, lalu coba lagi." } satisfies ScanResponse,
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        docType: "UNKNOWN",
        previewUrl: fileUrl,
        warnings: result?.warnings ?? [],
        error: "Dokumen tidak dikenali sebagai KTP atau Kartu Keluarga.",
      } satisfies ScanResponse,
      { status: 422 }
    );
  }

  const needsReview = result.confidence < 0.7 || result.warnings.length > 0;

  // DB opsional: kalau belum dikonfigurasi, tetap balikin hasil ekstraksi.
  if (!isDbConfigured()) {
    return NextResponse.json({
      ok: true,
      docType: result.doc_type,
      confidence: result.confidence,
      warnings: result.warnings,
      previewUrl: fileUrl,
      error: "Data TIDAK disimpan: DATABASE_URL belum diset di .env.local.",
    } satisfies ScanResponse);
  }

  try {
    await ensureSchema();
    const pool = getPool()!;
    const warns = JSON.stringify(result.warnings);

    if (result.doc_type === "KTP" && result.ktp) {
      const k = result.ktp;
      const ins = await pool.query(
        `INSERT INTO ktp_records ${KTP_COLUMNS}
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
         RETURNING *`,
        [fileName, fileUrl, k.nama, k.nik, k.tempat_lahir, k.tgl_lahir, k.alamat, k.rt_rw,
         k.kel_desa, k.kecamatan, k.kabupaten, k.provinsi, k.agama, k.status_perkawinan,
         k.pekerjaan, result.confidence, needsReview, warns]
      );
      const ktp = ins.rows[0] as KtpRecord;
      return NextResponse.json({
        ok: true, docType: "KTP", confidence: result.confidence,
        warnings: result.warnings, previewUrl: fileUrl, ktp,
      } satisfies ScanResponse);
    }

    if (result.doc_type === "KK" && result.kk) {
      const kk = result.kk;
      const rows: KkRecord[] = [];
      for (const m of kk.anggota) {
        const ins = await pool.query(
          `INSERT INTO kk_records ${KK_COLUMNS}
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb)
           RETURNING *`,
          [fileName, fileUrl, kk.no_kk, m.nama, m.nik, m.jenis_kelamin, m.tempat_lahir,
           m.tgl_lahir, kk.alamat, kk.rt_rw, kk.kel_desa, kk.kecamatan, kk.kabupaten,
           kk.provinsi, m.agama, m.status_perkawinan, m.pekerjaan, m.hubungan_keluarga,
           kk.jumlah_istri, kk.jumlah_anak, result.confidence, needsReview, warns]
        );
        rows.push(ins.rows[0] as KkRecord);
      }
      return NextResponse.json({
        ok: true, docType: "KK", confidence: result.confidence,
        warnings: result.warnings, previewUrl: fileUrl, kk: rows,
      } satisfies ScanResponse);
    }

    return NextResponse.json(
      { ok: false, error: "Hasil ekstraksi tidak lengkap." } satisfies ScanResponse,
      { status: 500 }
    );
  } catch (err) {
    console.error("Gagal menyimpan ke database:", err);
    return NextResponse.json(
      { ok: false, docType: result.doc_type, previewUrl: fileUrl, error: "Gagal menyimpan hasil ke database." } satisfies ScanResponse,
      { status: 500 }
    );
  }
}
