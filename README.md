# WargaScan

> AI-powered scanner that turns Indonesian ID cards (KTP) and family cards (Kartu Keluarga) into clean, structured database records.

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![Gemini](https://img.shields.io/badge/Google-Gemini_Vision-4285F4)](https://ai.google.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791)](https://www.postgresql.org)

## What it does

Upload a photo or PDF of an Indonesian **KTP** (ID card) or **Kartu Keluarga** (family card) — WargaScan automatically:

1. **Classifies** the document type (KTP vs KK vs unknown)
2. **Extracts** all fields with a vision LLM using a strict JSON schema (no hallucinated values — unreadable fields stay empty)
3. **Stores** the result in the right table: one row per KTP, one row **per family member** for KK
4. **Flags** low-confidence results for manual review

The UI shows a live preview with a document **scan animation** while extraction runs, then the new records slide into the data table.

## Key features

- Drag & drop upload — JPG, PNG, PDF (PDF pages auto-rendered to images)
- Structured output via Gemini JSON schema — anti-hallucination by design
- Confidence score + per-record review warnings
- Separate **KTP** and **Kartu Keluarga** data tables with full demographic columns
- Graceful degradation: runs without a database (results shown, not persisted) and surfaces clear setup warnings
- Safe file handling: magic-byte type detection, path-traversal-proof file serving, size limits

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript |
| AI extraction | Google Gemini vision + structured JSON output |
| PDF processing | pdfjs via `pdf-to-img` (no native canvas deps) |
| Database | PostgreSQL (works with any managed Postgres, e.g. Neon) |
| UI | Tailwind CSS v4, custom CSS scan animation |

## Pipeline

```
Upload (image/PDF)
  → Validate (magic bytes, size ≤ 10MB)
  → Pre-process (PDF → PNG per page)
  → AI classify (KTP / KK / UNKNOWN)
  → AI extract (strict JSON schema)
  → Post-validate (confidence, warnings)
  → Persist to ktp_records / kk_records
```

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the two variables below
npm run dev
```

**Environment variables:**

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | Free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `DATABASE_URL` | Any PostgreSQL — locally, or free from [neon.tech](https://neon.tech) |

Open http://localhost:3000, drop a document, done.

## Database schema

Two tables created automatically on first run (`CREATE TABLE IF NOT EXISTS`):

- **`ktp_records`** — name, NIK, birthplace/date, address, RT/RW, ward/district/regency, religion, marital status, occupation
- **`kk_records`** — same member columns + family card number, relationship role, household totals (wives/children), one row per member

## Notes

- The back side of an e-KTP contains no core data; the system still detects it as KTP and emits a "needs front side" warning instead of guessing.
- Uploaded documents are stored on disk under `uploads/` and served through a validated route — wire this to object storage (S3/GCS) for production.
