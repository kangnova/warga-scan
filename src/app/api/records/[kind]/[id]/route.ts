import { NextResponse } from "next/server";
import { ensureSchema, getPool, isDbConfigured } from "@/lib/db";
import { deleteUpload, type StorageBackend } from "@/lib/storage";

export const runtime = "nodejs";

interface RecordRow {
  file_backend?: StorageBackend;
  file_path?: string;
}

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
    const pool = getPool()!;
    const table = kind === "ktp" ? "ktp_records" : "kk_records";

    // Ambil info file dulu, hapus fisiknya (best-effort), lalu hapus barisnya.
    const sel = await pool.query<RecordRow>(
      `SELECT file_backend, file_path FROM ${table} WHERE id = $1`,
      [numId]
    );
    const row = sel.rows[0];
    if (row) {
      await deleteUpload({ backend: row.file_backend ?? "disk", objectPath: row.file_path });
    }

    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [numId]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/records error:", err);
    return NextResponse.json({ ok: false, error: "Gagal menghapus data." }, { status: 500 });
  }
}
