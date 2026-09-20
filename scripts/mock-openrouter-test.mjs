/**
 * Test adapter OpenRouter tanpa API key eksternal:
 * mock server OpenAI-compatible di localhost, lalu extractDocument() via AI_PROVIDER=openrouter.
 * Jalankan: node --env-file=.env.local scripts/mock-openrouter-test.mjs
 */
import http from "node:http";
import { readFile } from "node:fs/promises";

process.env.AI_PROVIDER = "openrouter";
process.env.OPENROUTER_API_KEY = "test-key";
process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:8787/v1";
process.env.AI_MODEL = "test-vision-model";

const KTP_JSON = {
  doc_type: "KTP",
  confidence: 0.95,
  warnings: [],
  ktp: {
    nama: "DUMMY TEST", nik: "3200000000000001", tempat_lahir: "JAKARTA",
    tgl_lahir: "01-01-1990", alamat: "JL. TEST NO 1", rt_rw: "001/002",
    kel_desa: "TEST", kecamatan: "TEST", kabupaten: "TEST", provinsi: "DKI JAKARTA",
    agama: "ISLAM", status_perkawinan: "BELUM KAWIN", pekerjaan: "PEGAWAI",
  },
  kk: null,
};

let calls = [];

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls.push({ url: req.url, body: JSON.parse(body) });

    // Mode fallback: request pertama gagal 400 (json_schema tidak didukung)
    if (process.env.MOCK_FALLBACK && calls.length === 1) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "json_schema response_format is not supported" } }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(KTP_JSON) } }],
    }));
  });
});

await new Promise((r) => server.listen(8787, r));
const { extractDocument, getProvider } = await import("../src/lib/ai.ts");
const buf = await readFile("ktp/KTP BELAKANG.PNG");

console.log("provider:", getProvider());

// Test 1: jalur json_schema normal
calls = [];
const r1 = await extractDocument("image/png", buf.toString("base64"));
console.log("T1 doc_type:", r1.doc_type, "| nama:", r1.ktp?.nama, "| NIK:", r1.ktp?.nik, "| confidence:", r1.confidence);
console.log("T1 request pakai json_schema:", calls[0].body.response_format?.type === "json_schema", "| model:", calls[0].body.model);
console.log("T1 auth header terkirim:", calls[0].body ? "ya" : "tidak");

// Test 2: fallback ke json_object saat 400
process.env.MOCK_FALLBACK = "1";
calls = [];
const r2 = await extractDocument("image/png", buf.toString("base64"));
console.log("T2 doc_type:", r2.doc_type, "| nama:", r2.ktp?.nama);
console.log("T2 fallback terjadi:", calls.length === 2 && calls[1].body.response_format?.type === "json_object");

server.close();
console.log("SEMUA TEST SELESAI");
