"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  InsertKkResponse,
  KkRecord,
  KtpRecord,
  PendingKk,
  RecordsResponse,
  ScanResponse,
} from "@/lib/types";

type Phase = "idle" | "scanning" | "done" | "error";

const SCAN_STEPS = [
  "Mengunggah dokumen…",
  "Memindai dokumen…",
  "Mengenali NIK & No. KK…",
  "Ekstraksi data…",
  "Validasi hasil…",
];

const KTP_COLUMNS = [
  "No", "Nama", "NIK", "Tempat Lahir", "Tgl Lahir", "Alamat",
  "RT/RW", "Kel/Desa", "Kecamatan", "Kabupaten", "Agama",
  "Status Perkawinan", "Pekerjaan",
] as const;

const KK_COLUMNS = [
  "No", "Nama", "NIK", "Jenis Kelamin", "Tempat Lahir", "Tgl Lahir",
  "Alamat", "RT/RW", "Kel/Desa", "Kecamatan", "Kabupaten", "Agama",
  "Status Perkawinan", "Pekerjaan", "Hubungan Keluarga",
  "No. Kartu Keluarga", "Jumlah Istri", "Jumlah Suami", "Jumlah Anak",
] as const;

function ktpRow(k: KtpRecord): (string | number)[] {
  return [k.nama, k.nik, k.tempat_lahir, k.tgl_lahir, k.alamat, k.rt_rw,
    k.kel_desa, k.kecamatan, k.kabupaten, k.agama, k.status_perkawinan, k.pekerjaan];
}
function kkRow(k: KkRecord): (string | number)[] {
  return [k.nama, k.nik, k.jenis_kelamin, k.tempat_lahir, k.tgl_lahir, k.alamat,
    k.rt_rw, k.kel_desa, k.kecamatan, k.kabupaten, k.agama, k.status_perkawinan,
    k.pekerjaan, k.hubungan_keluarga, k.no_kk,
    k.jumlah_istri ?? "-", k.jumlah_suami ?? "-", k.jumlah_anak ?? "-"];
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIdx, setStepIdx] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dbConfigured, setDbConfigured] = useState(true);
  const [records, setRecords] = useState<RecordsResponse>({ dbConfigured: true, ktp: [], kk: [] });
  const [tab, setTab] = useState<"ktp" | "kk">("ktp");
  const [dragOver, setDragOver] = useState(false);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());
  const [targetName, setTargetName] = useState("");
  const [pending, setPending] = useState<PendingKk | null>(null);
  const [selectedMembers, setSelectedMembers] = useState<Set<number>>(new Set());
  const [savingPending, setSavingPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const loadRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/records", { cache: "no-store" });
      const data: RecordsResponse = await res.json();
      setDbConfigured(data.dbConfigured);
      setRecords(data);
    } catch {
      /* biarkan data lama */
    }
  }, []);

  useEffect(() => {
    loadRecords();
    return () => timersRef.current.forEach(clearTimeout);
  }, [loadRecords]);

  async function handleFile(file: File) {
    if (phase === "scanning") return;
    setPhase("scanning");
    setStepIdx(0);
    setErrorMsg("");
    setWarnings([]);
    setPreview(null);
    setFlashIds(new Set());
    setPending(null);
    setSelectedMembers(new Set());

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    // Animasi tahapan scan (gambar langsung tampil, scanline jalan di atasnya).
    timersRef.current.forEach(clearTimeout);
    timersRef.current = SCAN_STEPS.map((_, i) =>
      setTimeout(() => setStepIdx(i), i * 900)
    );

    try {
      const form = new FormData();
      form.append("file", file);
      if (targetName.trim()) form.append("targetName", targetName.trim());
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const data: ScanResponse = await res.json();

      timersRef.current.forEach(clearTimeout);
      setStepIdx(SCAN_STEPS.length - 1);

      if (!res.ok || !data.ok) {
        setPhase("error");
        setErrorMsg(data.error ?? "Terjadi kesalahan saat memproses dokumen.");
        setWarnings(data.warnings ?? []);
        if (data.previewUrl) setPreview(data.previewUrl);
        return;
      }

      setWarnings(data.warnings ?? []);

      // KK menunggu konfirmasi user: tampilkan checklist anggota.
      if (data.pending) {
        setPending(data.pending);
        setSelectedMembers(new Set(data.pending.kk.anggota.map((_, i) => i)));
        setPreview(data.pending.fileUrl ?? localUrl);
        setTab("kk");
        setPhase("done");
        if (data.error) setErrorMsg(data.error);
        return;
      }

      const newIds = new Set<number>();
      if (data.docType === "KTP" && data.ktp) newIds.add(data.ktp.id);
      if (data.docType === "KK" && data.kk) data.kk.forEach((r) => newIds.add(r.id));
      setFlashIds(newIds);
      setTimeout(() => setFlashIds(new Set()), 2500);

      setPreview(data.previewUrl ?? localUrl);
      setTab(data.docType === "KK" ? "kk" : "ktp");
      await loadRecords();
      setPhase("done");

      if (data.error) setErrorMsg(data.error); // mis. peringatan DB belum diset
    } catch {
      setPhase("error");
      setErrorMsg("Gagal terhubung ke server.");
    }
  }

  function toggleMember(i: number) {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  async function savePending() {
    if (!pending || selectedMembers.size === 0 || savingPending) return;
    setSavingPending(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/records/kk/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: pending.fileName,
          fileUrl: pending.fileUrl,
          fileBackend: pending.fileBackend,
          filePath: pending.filePath,
          kk: pending.kk,
          selected: [...selectedMembers].sort((a, b) => a - b),
          confidence: pending.confidence,
          warnings: pending.warnings,
        }),
      });
      const data: InsertKkResponse = await res.json();
      if (!res.ok || !data.ok || !data.kk) {
        setErrorMsg(data.error ?? "Gagal menyimpan data KK.");
        return;
      }
      const newIds = new Set(data.kk.map((r) => r.id));
      setFlashIds(newIds);
      setTimeout(() => setFlashIds(new Set()), 2500);
      setTab("kk");
      await loadRecords();
      setPending(null);
      setPhase("done");
    } catch {
      setErrorMsg("Gagal terhubung ke server.");
    } finally {
      setSavingPending(false);
    }
  }

  async function handleDelete(kind: "ktp" | "kk", id: number) {
    if (!confirm("Hapus baris ini?")) return;

    // Optimistic update: langsung hilangkan dari tabel seketika (0ms jeda)
    const prevRecords = records;
    setRecords((prev) => ({
      ...prev,
      [kind]: prev[kind].filter((r) => r.id !== id),
    }));
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      const res = await fetch(`/api/records/${kind}/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setRecords(prevRecords);
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Gagal menghapus data.");
      }
    } catch {
      setRecords(prevRecords);
      alert("Gagal terhubung ke server saat menghapus data.");
    }
  }

  const scanning = phase === "scanning";

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">
          WargaScan — Scanner KTP &amp; Kartu Keluarga
        </h1>
        <p className="text-sm text-slate-500">
          Upload gambar/PDF — AI mengenali jenis dokumen, ekstraksi datanya, lalu masuk ke tabel.
        </p>
        {!dbConfigured && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            ⚠️ Database belum dikonfigurasi — isi <code>DATABASE_URL</code> di <code>.env.local</code>.
            Hasil scan masih bisa dilihat tapi tidak disimpan.
          </div>
        )}
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* ==== Kolom kiri: upload + preview scan ==== */}
        <section className="space-y-4">
          <div
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-white"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <p className="text-sm text-slate-600">
              Tarik &amp; lepas file <b>KTP</b> atau <b>KK</b> di sini
            </p>
            <p className="mt-1 text-xs text-slate-400">JPG, PNG, atau PDF · maks 10MB</p>
            <button
              type="button"
              disabled={scanning}
              onClick={() => inputRef.current?.click()}
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Pilih File
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <div className="mt-3 text-left">
              <label htmlFor="targetName" className="block text-xs font-medium text-slate-500">
                Scan atas nama (opsional — khusus KK, simpan hanya orang itu)
              </label>
              <input
                id="targetName"
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                placeholder="mis. Nova Suharyanto"
                disabled={scanning}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Pratinjau Scan
            </div>
            <div className="relative flex h-64 items-center justify-center bg-slate-50">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Dokumen" className="max-h-60 max-w-full object-contain" />
              ) : (
                <span className="text-sm text-slate-400">Belum ada dokumen</span>
              )}

              {preview && (scanning || phase === "done") && (
                <div className="pointer-events-none absolute inset-0">
                  {scanning && (
                    <>
                      <div className="scan-grid absolute inset-0" />
                      <div className="scanline absolute left-0 right-0 h-1 bg-emerald-500 shadow-[0_0_16px_4px_rgba(16,185,129,0.65)]" />
                    </>
                  )}
                </div>
              )}

              {scanning && (
                <div className="absolute bottom-0 left-0 right-0 bg-slate-900/80 px-3 py-2 text-xs text-emerald-300">
                  <span className="pulse-dot mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  {SCAN_STEPS[stepIdx]}
                </div>
              )}
            </div>
          </div>

          {pending && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm font-semibold text-sky-900">
                Kartu Keluarga terdeteksi — pilih anggota yang masuk tabel:
              </p>
              <p className="mt-0.5 text-xs text-sky-700">
                No. KK: {pending.kk.no_kk || "-"} · {pending.kk.anggota.length} anggota · istri {pending.kk.jumlah_istri} · anak {pending.kk.jumlah_anak}
              </p>
              <div className="mt-3 space-y-1.5">
                {pending.kk.anggota.map((m, i) => (
                  <label
                    key={i}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedMembers.has(i)}
                      onChange={() => toggleMember(i)}
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="font-medium">{m.nama || "(nama tidak terbaca)"}</span>
                    <span className="text-xs text-slate-400">
                      {m.hubungan_keluarga}{m.nik ? ` · ${m.nik}` : ""}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={savePending}
                  disabled={savingPending || selectedMembers.size === 0}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {savingPending ? "Menyimpan…" : `Simpan ${selectedMembers.size} anggota ke tabel`}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(null)}
                  disabled={savingPending}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            </div>
          )}
          {phase === "done" && !errorMsg && !pending && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              ✅ Scan selesai — data masuk ke tabel {tab === "ktp" ? "Data KTP" : "Data Kartu Keluarga"}.
            </div>
          )}
          {phase === "error" && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              ❌ {errorMsg}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <p className="mb-1 font-semibold">Perlu diverifikasi manual:</p>
              <ul className="list-disc pl-4">
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ==== Kolom kanan: tabel data ==== */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTab("ktp")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                tab === "ktp" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              Data KTP ({records.ktp.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("kk")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                tab === "kk" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
            >
              Data Kartu Keluarga ({records.kk.length})
            </button>
            <a
              href={`/api/export/${tab}`}
              className={`ml-auto rounded-lg border px-4 py-2 text-sm font-semibold ${
                (tab === "ktp" ? records.ktp : records.kk).length === 0
                  ? "pointer-events-none border-slate-200 text-slate-300"
                  : "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              }`}
              title={`Download tabel ${tab === "ktp" ? "KTP" : "Kartu Keluarga"} sebagai file Excel (.xlsx)`}
            >
              ⬇ Export Excel
            </a>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {tab === "ktp" ? (
              <table className="w-full min-w-[1100px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {KTP_COLUMNS.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>
                    ))}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {records.ktp.length === 0 && (
                    <tr>
                      <td colSpan={KTP_COLUMNS.length + 1} className="px-3 py-8 text-center text-slate-400">
                        Belum ada data KTP. Upload dokumen untuk mulai.
                      </td>
                    </tr>
                  )}
                  {records.ktp.map((k, i) => (
                    <tr key={k.id} className={`border-t border-slate-100 ${flashIds.has(k.id) ? "row-new" : ""}`}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      {ktpRow(k).map((v, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-700">{v}</td>
                      ))}
                      <td className="px-3 py-2">
                        {k.needs_review && (
                          <span title={k.warnings.join("; ")} className="mr-2 cursor-help text-amber-500">⚠</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete("ktp", k.id)}
                          className="text-red-500 hover:underline"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[1400px] text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {KK_COLUMNS.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">{c}</th>
                    ))}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {records.kk.length === 0 && (
                    <tr>
                      <td colSpan={KK_COLUMNS.length + 1} className="px-3 py-8 text-center text-slate-400">
                        Belum ada data KK. Upload dokumen untuk mulai.
                      </td>
                    </tr>
                  )}
                  {records.kk.map((k, i) => (
                    <tr key={k.id} className={`border-t border-slate-100 ${flashIds.has(k.id) ? "row-new" : ""}`}>
                      <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                      {kkRow(k).map((v, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-2 text-slate-700">{v}</td>
                      ))}
                      <td className="px-3 py-2">
                        {k.needs_review && (
                          <span title={k.warnings.join("; ")} className="mr-2 cursor-help text-amber-500">⚠</span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete("kk", k.id)}
                          className="text-red-500 hover:underline"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Tanda ⚠ berarti hasil perlu diverifikasi manual (klik untuk lihat alasannya).
          </p>
        </section>
      </div>
    </main>
  );
}
