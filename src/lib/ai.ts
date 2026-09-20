import { GoogleGenAI } from "@google/genai";
import type { ExtractionResult, DocType } from "./types";

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

const PROMPT = `Kamu adalah mesin OCR cerdas untuk dokumen identitas resmi Indonesia (KTP dan Kartu Keluarga).
Analisa gambar dokumen berikut, lalu klasifikasikan jenisnya dan ekstrak seluruh datanya.

ATURAN KETAT:
1. doc_type: "KTP" jika dokumennya KTP/e-KTP (sisi depan atau belakang), "KK" jika Kartu Keluarga, selain itu "UNKNOWN".
2. Salin teks PERSIS seperti tertulis di dokumen (ejaan, huruf kapital, tanda baca). JANGAN mengarang, menebak, atau melengkapi data yang tidak ada.
3. Field yang tidak terbaca atau tidak ada di dokumen: isi string kosong "".
4. nik dan no_kk: hanya angka 16 digit tanpa spasi/tanda hubung.
5. tgl_lahir: pertahankan format DD-MM-YYYY seperti di dokumen.
6. rt_rw: format "001/002" — pertahankan nol di depan, tetap satu kolom dipisah "/".
7. alamat: alamat jalan lengkap saja (termasuk DUSUN/ blok jika ada), TANPA RT/RW, kel/desa, kecamatan, kabupaten, provinsi karena itu kolom terpisah.
8. Untuk KK: anggota berisi SEMUA anggota keluarga termasuk KEPALA KELUARGA, sesuai urutan baris di dokumen.
   hubungan_keluarga contoh: "KEPALA KELUARGA", "ISTRI", "ANAK", "FAMILIA LAIN", "MENANTU".
9. jumlah_istri: jumlah anggota yang hubungan_keluarga-nya ISTRI. jumlah_anak: jumlah anggota yang hubungan_keluarga-nya diawali kata ANAK (ANAK, ANAK SAMBUNG, ANAK ANGKAT).
10. KTP sisi belakang biasanya tidak memuat data utama: tetap doc_type "KTP", semua field ktp string kosong, dan tambahkan warning.
11. warnings: daftar string hal yang perlu diverifikasi manusia, contoh: "NIK terbaca 15 digit", "Sebagian dokumen tertutup bayangan", "Foto buram". Jika tidak ada, array kosong.
12. confidence: angka 0 sampai 1, estimasi keyakinan keseluruhan pembacaan dokumen.

Kembalikan HANYA JSON valid sesuai skema.`;

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    doc_type: { type: "string", enum: ["KTP", "KK", "UNKNOWN"] },
    confidence: { type: "number" },
    warnings: { type: "array", items: { type: "string" } },
    ktp: {
      type: "object",
      properties: {
        nama: { type: "string" },
        nik: { type: "string" },
        tempat_lahir: { type: "string" },
        tgl_lahir: { type: "string" },
        alamat: { type: "string" },
        rt_rw: { type: "string" },
        kel_desa: { type: "string" },
        kecamatan: { type: "string" },
        kabupaten: { type: "string" },
        provinsi: { type: "string" },
        agama: { type: "string" },
        status_perkawinan: { type: "string" },
        pekerjaan: { type: "string" },
      },
      required: [
        "nama", "nik", "tempat_lahir", "tgl_lahir", "alamat", "rt_rw",
        "kel_desa", "kecamatan", "kabupaten", "provinsi", "agama",
        "status_perkawinan", "pekerjaan",
      ],
    },
    kk: {
      type: "object",
      properties: {
        no_kk: { type: "string" },
        alamat: { type: "string" },
        rt_rw: { type: "string" },
        kel_desa: { type: "string" },
        kecamatan: { type: "string" },
        kabupaten: { type: "string" },
        provinsi: { type: "string" },
        jumlah_istri: { type: "integer" },
        jumlah_anak: { type: "integer" },
        anggota: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nama: { type: "string" },
              nik: { type: "string" },
              jenis_kelamin: { type: "string" },
              tempat_lahir: { type: "string" },
              tgl_lahir: { type: "string" },
              agama: { type: "string" },
              status_perkawinan: { type: "string" },
              pekerjaan: { type: "string" },
              hubungan_keluarga: { type: "string" },
            },
            required: [
              "nama", "nik", "jenis_kelamin", "tempat_lahir", "tgl_lahir",
              "agama", "status_perkawinan", "pekerjaan", "hubungan_keluarga",
            ],
          },
        },
      },
      required: [
        "no_kk", "alamat", "rt_rw", "kel_desa", "kecamatan", "kabupaten",
        "provinsi", "jumlah_istri", "jumlah_anak", "anggota",
      ],
    },
  },
  required: ["doc_type", "confidence", "warnings", "ktp", "kk"],
} as const;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseResult(raw: unknown): ExtractionResult {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const docType: DocType = obj.doc_type === "KK" || obj.doc_type === "KTP" ? obj.doc_type : "UNKNOWN";

  const ktpRaw = (obj.ktp ?? {}) as Record<string, unknown>;
  const kkRaw = (obj.kk ?? {}) as Record<string, unknown>;

  const ktp = {
    nama: asText(ktpRaw.nama),
    nik: asText(ktpRaw.nik),
    tempat_lahir: asText(ktpRaw.tempat_lahir),
    tgl_lahir: asText(ktpRaw.tgl_lahir),
    alamat: asText(ktpRaw.alamat),
    rt_rw: asText(ktpRaw.rt_rw),
    kel_desa: asText(ktpRaw.kel_desa),
    kecamatan: asText(ktpRaw.kecamatan),
    kabupaten: asText(ktpRaw.kabupaten),
    provinsi: asText(ktpRaw.provinsi),
    agama: asText(ktpRaw.agama),
    status_perkawinan: asText(ktpRaw.status_perkawinan),
    pekerjaan: asText(ktpRaw.pekerjaan),
  };

  const members = Array.isArray(kkRaw.anggota) ? kkRaw.anggota : [];
  const kk = {
    no_kk: asText(kkRaw.no_kk),
    alamat: asText(kkRaw.alamat),
    rt_rw: asText(kkRaw.rt_rw),
    kel_desa: asText(kkRaw.kel_desa),
    kecamatan: asText(kkRaw.kecamatan),
    kabupaten: asText(kkRaw.kabupaten),
    provinsi: asText(kkRaw.provinsi),
    jumlah_istri: typeof kkRaw.jumlah_istri === "number" ? kkRaw.jumlah_istri : 0,
    jumlah_anak: typeof kkRaw.jumlah_anak === "number" ? kkRaw.jumlah_anak : 0,
    anggota: members.map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        nama: asText(r.nama),
        nik: asText(r.nik),
        jenis_kelamin: asText(r.jenis_kelamin),
        tempat_lahir: asText(r.tempat_lahir),
        tgl_lahir: asText(r.tgl_lahir),
        agama: asText(r.agama),
        status_perkawinan: asText(r.status_perkawinan),
        pekerjaan: asText(r.pekerjaan),
        hubungan_keluarga: asText(r.hubungan_keluarga),
      };
    }),
  };

  const confidence = typeof obj.confidence === "number" ? Math.min(1, Math.max(0, obj.confidence)) : 0.5;
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0)
    : [];

  return {
    doc_type: docType,
    confidence,
    warnings,
    ktp: docType === "KTP" ? ktp : null,
    kk: docType === "KK" ? kk : null,
  };
}

/** Kirim 1 gambar (base64) ke Gemini, hasilkan ekstraksi terstruktur. */
export async function extractDocument(mimeType: string, imageBase64: string): Promise<ExtractionResult> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY belum diset. Isi .env.local lalu restart dev server.");
  }
  const client = new GoogleGenAI({});
  const interaction = await client.interactions.create({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
    input: [
      { type: "text", text: PROMPT },
      {
        type: "image",
        data: imageBase64,
        mime_type: mimeType as "image/png" | "image/jpeg",
      },
    ],
    // Structured output (SDK v2): response_format polimorfik, response_mime_type dihapus.
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: EXTRACT_SCHEMA,
    },
  });

  const text = (interaction as { output_text?: string }).output_text ?? "";
  try {
    return parseResult(JSON.parse(text));
  } catch {
    throw new Error("Gagal membaca respons AI (JSON tidak valid). Coba ulangi scan.");
  }
}
