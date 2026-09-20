import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db";
import type { KkRecord, KtpRecord, RecordsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ dbConfigured: false, ktp: [], kk: [] } satisfies RecordsResponse);
  }
  try {
    await ensureSchema();
    const pool = getPool()!;

    const ktpRes = await pool.query(
      `SELECT * FROM ktp_records ORDER BY created_at DESC, id DESC LIMIT 500`
    );
    const kkRes = await pool.query(
      `SELECT * FROM kk_records ORDER BY created_at DESC, id DESC LIMIT 500`
    );

    return NextResponse.json({
      dbConfigured: true,
      ktp: ktpRes.rows as KtpRecord[],
      kk: kkRes.rows as KkRecord[],
    } satisfies RecordsResponse);
  } catch (err) {
    console.error("GET /api/records error:", err);
    return NextResponse.json(
      { dbConfigured: true, ktp: [], kk: [], error: "Gagal mengambil data dari database." },
      { status: 500 }
    );
  }
}
