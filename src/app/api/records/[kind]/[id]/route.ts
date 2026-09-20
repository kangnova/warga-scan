import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ kind: string; id: string }> }
) {
  const { kind, id } = await ctx.params;
  const numId = Number(id);
  if ((kind !== "ktp" && kind !== "kk") || !Number.isInteger(numId)) {
    return NextResponse.json({ ok: false, error: "Parameter tidak valid." }, { status: 400 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database belum dikonfigurasi." }, { status: 503 });
  }

  try {
    await ensureSchema();
    const table = kind === "ktp" ? "ktp_records" : "kk_records";
    await getPool()!.query(`DELETE FROM ${table} WHERE id = $1`, [numId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/records error:", err);
    return NextResponse.json({ ok: false, error: "Gagal menghapus data." }, { status: 500 });
  }
}
