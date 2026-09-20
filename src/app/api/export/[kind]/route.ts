import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface KtpRow {
  nama: string; nik: string; tempat_lahir: string; tgl_lahir: string;
  alamat: string; rt_rw: string; kel_desa: string; kecamatan: string;
  kabupaten: string; agama: string; status_perkawinan: string; pekerjaan: string;
  needs_review: boolean; created_at: string;
}
interface KkRow extends KtpRow {
  jenis_kelamin: string; no_kk: string; hubungan_keluarga: string;
  jumlah_istri: number | null; jumlah_suami: number | null; jumlah_anak: number | null;
}

const HEADER_FILL = "FF0F172A";
const jakartaTime = (d: string | Date) =>
  new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });

function styleSheet(ws: ExcelJS.Worksheet, colCount: number) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colCount } };
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ kind: string }> }
) {
  const { kind } = await ctx.params;
  if (kind !== "ktp" && kind !== "kk") {
    return NextResponse.json({ error: "Jenis export tidak valid." }, { status: 400 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database belum dikonfigurasi." }, { status: 503 });
  }

  try {
    await ensureSchema();
    const pool = getPool()!;
    const wb = new ExcelJS.Workbook();
    wb.creator = "WargaScan";
    wb.created = new Date();
    const today = new Date().toISOString().slice(0, 10);

    if (kind === "ktp") {
      const { rows } = await pool.query<KtpRow>(
        `SELECT * FROM ktp_records ORDER BY created_at DESC, id DESC LIMIT 5000`
      );
      const ws = wb.addWorksheet("Data KTP");
      ws.columns = [
        { header: "No", key: "no", width: 5 },
        { header: "Nama", key: "nama", width: 26 },
        { header: "NIK", key: "nik", width: 19 },
        { header: "Tempat Lahir", key: "tempat_lahir", width: 15 },
        { header: "Tgl Lahir", key: "tgl_lahir", width: 12 },
        { header: "Alamat", key: "alamat", width: 34 },
        { header: "RT/RW", key: "rt_rw", width: 10 },
        { header: "Kel/Desa", key: "kel_desa", width: 16 },
        { header: "Kecamatan", key: "kecamatan", width: 16 },
        { header: "Kabupaten", key: "kabupaten", width: 18 },
        { header: "Agama", key: "agama", width: 12 },
        { header: "Status Perkawinan", key: "status_perkawinan", width: 16 },
        { header: "Pekerjaan", key: "pekerjaan", width: 20 },
        { header: "Perlu Review", key: "review", width: 12 },
        { header: "Waktu Scan", key: "scan", width: 20 },
      ];
      rows.forEach((r, i) => {
        const row = ws.addRow({
          no: i + 1, nama: r.nama, nik: r.nik, tempat_lahir: r.tempat_lahir,
          tgl_lahir: r.tgl_lahir, alamat: r.alamat, rt_rw: r.rt_rw,
          kel_desa: r.kel_desa, kecamatan: r.kecamatan, kabupaten: r.kabupaten,
          agama: r.agama, status_perkawinan: r.status_perkawinan, pekerjaan: r.pekerjaan,
          review: r.needs_review ? "YA" : "-", scan: jakartaTime(r.created_at),
        });
        // NIK sebagai teks agar Excel tidak mengubahnya jadi notasi ilmiah.
        row.getCell("nik").numFmt = "@";
      });
      styleSheet(ws, 15);
    } else {
      const { rows } = await pool.query<KkRow>(
        `SELECT * FROM kk_records ORDER BY created_at DESC, id DESC LIMIT 5000`
      );
      const ws = wb.addWorksheet("Data Kartu Keluarga");
      ws.columns = [
        { header: "No", key: "no", width: 5 },
        { header: "Nama", key: "nama", width: 26 },
        { header: "NIK", key: "nik", width: 19 },
        { header: "Jenis Kelamin", key: "jk", width: 13 },
        { header: "Tempat Lahir", key: "tempat_lahir", width: 15 },
        { header: "Tgl Lahir", key: "tgl_lahir", width: 12 },
        { header: "Alamat", key: "alamat", width: 34 },
        { header: "RT/RW", key: "rt_rw", width: 10 },
        { header: "Kel/Desa", key: "kel_desa", width: 16 },
        { header: "Kecamatan", key: "kecamatan", width: 16 },
        { header: "Kabupaten", key: "kabupaten", width: 18 },
        { header: "Agama", key: "agama", width: 12 },
        { header: "Status Perkawinan", key: "status_perkawinan", width: 16 },
        { header: "Pekerjaan", key: "pekerjaan", width: 20 },
        { header: "Hubungan Keluarga", key: "hubungan", width: 18 },
        { header: "No. Kartu Keluarga", key: "no_kk", width: 19 },
        { header: "Jumlah Istri", key: "istri", width: 12 },
        { header: "Jumlah Suami", key: "suami", width: 12 },
        { header: "Jumlah Anak", key: "anak", width: 12 },
        { header: "Perlu Review", key: "review", width: 12 },
        { header: "Waktu Scan", key: "scan", width: 20 },
      ];
      rows.forEach((r, i) => {
        const row = ws.addRow({
          no: i + 1, nama: r.nama, nik: r.nik, jk: r.jenis_kelamin,
          tempat_lahir: r.tempat_lahir, tgl_lahir: r.tgl_lahir, alamat: r.alamat,
          rt_rw: r.rt_rw, kel_desa: r.kel_desa, kecamatan: r.kecamatan,
          kabupaten: r.kabupaten, agama: r.agama, status_perkawinan: r.status_perkawinan,
          pekerjaan: r.pekerjaan, hubungan: r.hubungan_keluarga, no_kk: r.no_kk,
          istri: r.jumlah_istri ?? 0, suami: r.jumlah_suami ?? 0, anak: r.jumlah_anak ?? 0,
          review: r.needs_review ? "YA" : "-", scan: jakartaTime(r.created_at),
        });
        row.getCell("nik").numFmt = "@";
        row.getCell("no_kk").numFmt = "@";
      });
      styleSheet(ws, 21);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="warga-scan-${kind}-${today}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/export error:", err);
    return NextResponse.json({ error: "Gagal membuat file Excel." }, { status: 500 });
  }
}
