import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db";
import { insertKkMembers } from "@/lib/records";
import type { InsertKkRequest, InsertKkResponse } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Database belum dikonfigurasi." } satisfies InsertKkResponse,
      { status: 503 }
    );
  }

  let body: InsertKkRequest;
  try {
    body = (await req.json()) as InsertKkRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Request tidak valid." } satisfies InsertKkResponse, { status: 400 });
  }

  const { fileName, fileUrl, fileBackend, filePath, kk, selected } = body;
  if (!fileName || !fileUrl || !kk || !Array.isArray(kk.anggota)) {
    return NextResponse.json({ ok: false, error: "Data KK tidak lengkap." } satisfies InsertKkResponse, { status: 400 });
  }
  if (selected && (selected.length === 0 || selected.some((s) => !Number.isInteger(s) || s < 0 || s >= kk.anggota.length))) {
    return NextResponse.json({ ok: false, error: "Pilihan anggota tidak valid." } satisfies InsertKkResponse, { status: 400 });
  }

  try {
    await ensureSchema();
    const rows = await insertKkMembers(
      getPool()!,
      { fileName, fileUrl, fileBackend, filePath },
      kk,
      typeof body.confidence === "number" ? body.confidence : 0.5,
      Array.isArray(body.warnings) ? body.warnings : [],
      selected
    );
    return NextResponse.json({ ok: true, kk: rows } satisfies InsertKkResponse);
  } catch (err) {
    console.error("POST /api/records/kk/insert error:", err);
    return NextResponse.json({ ok: false, error: "Gagal menyimpan data KK." } satisfies InsertKkResponse, { status: 500 });
  }
}
