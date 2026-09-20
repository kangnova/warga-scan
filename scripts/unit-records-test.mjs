/**
 * Unit test logika perhitungan istri/suami/anak KK.
 * Jalankan: npx tsx scripts/unit-records-test.mjs
 */
import { kkRole, kkHouseholdCounts, kkCountsFor } from "../src/lib/records.ts";

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log("  ✓", label); }
  else { fail++; console.log("  ✗", label, "→ dapat", a, "harusnya", e); }
}

// --- kkRole ---
console.log("kkRole:");
eq(kkRole("KEPALA KELUARGA"), "kepala", "KEPALA KELUARGA → kepala");
eq(kkRole("SUAMI"), "suami", "SUAMI → suami");
eq(kkRole("ISTRI"), "istri", "ISTRI → istri");
eq(kkRole("ISTERI"), "istri", "ISTERI (ejaan resmi di KK) → istri");
eq(kkRole("ANAK"), "anak", "ANAK → anak");
eq(kkRole("ANAK SAMBUNG"), "anak", "ANAK SAMBUNG → anak");
eq(kkRole("MENANTU"), "other", "MENANTU → other");

// --- household counts: KK standar (1 kepala, 1 istri, 3 anak) ---
const kkStandar = {
  no_kk: "X", alamat: "", rt_rw: "", kel_desa: "", kecamatan: "", kabupaten: "", provinsi: "",
  jumlah_istri: 0, jumlah_anak: 0,
  anggota: [
    { nama: "A", nik: "", jenis_kelamin: "", tempat_lahir: "", tgl_lahir: "", agama: "", status_perkawinan: "", pekerjaan: "", hubungan_keluarga: "KEPALA KELUARGA" },
    { nama: "B", nik: "", jenis_kelamin: "", tempat_lahir: "", tgl_lahir: "", agama: "", status_perkawinan: "", pekerjaan: "", hubungan_keluarga: "ISTERI" },
    { nama: "C", nik: "", jenis_kelamin: "", tempat_lahir: "", tgl_lahir: "", agama: "", status_perkawinan: "", pekerjaan: "", hubungan_keluarga: "ANAK" },
    { nama: "D", nik: "", jenis_kelamin: "", tempat_lahir: "", tgl_lahir: "", agama: "", status_perkawinan: "", pekerjaan: "", hubungan_keluarga: "ANAK" },
    { nama: "E", nik: "", jenis_kelamin: "", tempat_lahir: "", tgl_lahir: "", agama: "", status_perkawinan: "", pekerjaan: "", hubungan_keluarga: "ANAK" },
  ],
};
console.log("household counts (KK standar):");
eq(kkHouseholdCounts(kkStandar), { jumlah_istri: 1, jumlah_suami: 1, jumlah_anak: 3 }, "istri=1, suami=1, anak=3");

console.log("per-anggota (KK standar):");
eq(kkCountsFor(kkStandar, kkStandar.anggota[0]), { jumlah_istri: 1, jumlah_suami: 0, jumlah_anak: 3 }, "Kepala → istri 1, suami 0 (kepala bukan suami), anak 3");
eq(kkCountsFor(kkStandar, kkStandar.anggota[1]), { jumlah_istri: 0, jumlah_suami: 1, jumlah_anak: 3 }, "Istri → istri 0, suami 1, anak 3");
eq(kkCountsFor(kkStandar, kkStandar.anggota[2]), { jumlah_istri: 0, jumlah_suami: 0, jumlah_anak: 0 }, "Anak → 0/0/0");

// --- edge: KK dengan 2 kepala keluarga (keluarga gabungan), masing2 istri ---
const kk2Kepala = {
  ...kkStandar,
  anggota: [
    { ...kkStandar.anggota[0], hubungan_keluarga: "KEPALA KELUARGA" },
    { ...kkStandar.anggota[1], hubungan_keluarga: "ISTERI" },
    { ...kkStandar.anggota[0], nama: "F", hubungan_keluarga: "KEPALA KELUARGA" },
    { ...kkStandar.anggota[1], nama: "G", hubungan_keluarga: "ISTERI" },
  ],
};
console.log("edge: 2 kepala keluarga:");
eq(kkHouseholdCounts(kk2Kepala), { jumlah_istri: 2, jumlah_suami: 2, jumlah_anak: 0 }, "istri=2, suami=2 (dijumlahkan), anak=0");
eq(kkCountsFor(kk2Kepala, kk2Kepala.anggota[0]), { jumlah_istri: 2, jumlah_suami: 0, jumlah_anak: 0 }, "Kepala → istri 2, suami 0");
eq(kkCountsFor(kk2Kepala, kk2Kepala.anggota[1]), { jumlah_istri: 0, jumlah_suami: 2, jumlah_anak: 0 }, "Istri → suami 2 (kepala dijumlahkan)");

// --- edge: baris SUAMI (kepala diganti suami) ---
const kkSuami = {
  ...kkStandar,
  anggota: [
    { ...kkStandar.anggota[0], hubungan_keluarga: "SUAMI" },
    { ...kkStandar.anggota[1], hubungan_keluarga: "ISTRI" },
    { ...kkStandar.anggota[2], hubungan_keluarga: "ANAK" },
  ],
};
console.log("edge: SUAMI + ISTRI + 1 ANAK:");
eq(kkCountsFor(kkSuami, kkSuami.anggota[0]), { jumlah_istri: 1, jumlah_suami: 0, jumlah_anak: 1 }, "Suami → istri 1, suami 0, anak 1");
eq(kkCountsFor(kkSuami, kkSuami.anggota[1]), { jumlah_istri: 0, jumlah_suami: 1, jumlah_anak: 1 }, "Istri → istri 0, suami 1, anak 1");

// --- edge: hanya 1 anak (anak tidak punya pasangan di KK) ---
console.log("edge: 1 anak saja di kolom anak:");
eq(kkCountsFor(kkSuami, kkSuami.anggota[2]), { jumlah_istri: 0, jumlah_suami: 0, jumlah_anak: 0 }, "Anak tunggal → 0/0/0");

console.log(`\n${pass} lolos, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
