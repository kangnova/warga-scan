export type DocType = "KTP" | "KK" | "UNKNOWN";

/** Hasil ekstraksi KTP (field kosong = string kosong) */
export interface KtpExtraction {
  nama: string;
  nik: string;
  tempat_lahir: string;
  tgl_lahir: string;
  alamat: string;
  rt_rw: string;
  kel_desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  agama: string;
  status_perkawinan: string;
  pekerjaan: string;
}

export interface KkMember {
  nama: string;
  nik: string;
  jenis_kelamin: string;
  tempat_lahir: string;
  tgl_lahir: string;
  agama: string;
  status_perkawinan: string;
  pekerjaan: string;
  hubungan_keluarga: string;
}

export interface KkExtraction {
  no_kk: string;
  alamat: string;
  rt_rw: string;
  kel_desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  jumlah_istri: number;
  jumlah_anak: number;
  anggota: KkMember[];
}

/** Output mentah + tervalidasi dari AI */
export interface ExtractionResult {
  doc_type: DocType;
  confidence: number;
  warnings: string[];
  ktp: KtpExtraction | null;
  kk: KkExtraction | null;
}

export interface BaseRecord {
  id: number;
  file_name: string;
  file_url: string;
  file_backend?: "supabase" | "disk";
  file_path?: string;
  confidence: number | null;
  needs_review: boolean;
  warnings: string[];
  created_at: string;
}

export interface KtpRecord extends BaseRecord, KtpExtraction {}

export interface KkRecord extends BaseRecord, KkMember {
  no_kk: string;
  alamat: string;
  rt_rw: string;
  kel_desa: string;
  kecamatan: string;
  kabupaten: string;
  provinsi: string;
  jumlah_istri: number | null;
  jumlah_anak: number | null;
}

export interface ScanResponse {
  ok: boolean;
  docType?: DocType;
  confidence?: number;
  warnings?: string[];
  previewUrl?: string;
  ktp?: KtpRecord;
  kk?: KkRecord[];
  error?: string;
}

export interface RecordsResponse {
  dbConfigured: boolean;
  ktp: KtpRecord[];
  kk: KkRecord[];
}
