/**
 * Probe provider OpenAI-compatible: cek koneksi, auth, dan daftar model.
 * Jalankan: node --env-file=.env.local scripts/probe-provider.mjs
 */
const baseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const apiKey = process.env.OPENROUTER_API_KEY || "";

if (!apiKey) {
  console.log("❌ OPENROUTER_API_KEY kosong — uncomment barisnya di .env.local (hapus tanda #).");
  process.exit(1);
}

console.log("Base URL:", baseUrl);
console.log("API Key :", apiKey.slice(0, 8) + "..." + apiKey.slice(-4));

let res;
try {
  res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
} catch (e) {
  console.log("❌ Gak bisa konek ke", baseUrl, "-", e.message);
  console.log("   → Cek lagi OPENROUTER_BASE_URL (harus berakhiran /v1) atau koneksi internet.");
  process.exit(1);
}

if (res.status === 401 || res.status === 403) {
  console.log(`❌ Auth gagal (HTTP ${res.status}) — API key salah/expired ATAU key ini bukan buat base URL ini.`);
  process.exit(1);
}
if (!res.ok) {
  console.log(`❌ HTTP ${res.status}:`, (await res.text()).slice(0, 200));
  process.exit(1);
}

const data = await res.json();
const models = (data.data ?? []).map((m) => m.id ?? m.name).filter(Boolean);
console.log(`✅ Koneksi & auth OK — ${models.length} model tersedia.`);

const visionHint = /vl|vision|multimodal|gemini|gpt-4|claude|pixtral|llama-3\.2|internvl/i;
const vision = models.filter((m) => visionHint.test(m));
console.log("\nKandidat model vision (harus dicek dukungan gambarnya di doc provider):");
for (const m of (vision.length ? vision : models).slice(0, 20)) console.log("  -", m);

if (process.env.AI_MODEL) {
  const exact = models.includes(process.env.AI_MODEL);
  console.log(`\nAI_MODEL di env: "${process.env.AI_MODEL}" → ${exact ? "✅ ada di katalog" : "❌ TIDAK ada di katalog — sesuaikan nama persisnya"}`);
} else {
  console.log('\nTip: set AI_MODEL di .env.local dengan salah satu nama model di atas.');
}
