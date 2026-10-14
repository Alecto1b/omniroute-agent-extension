# Rencana kontribusi: katalog sync yang relevan tanpa membuang model valid

Status: perubahan katalog minimal dan integrasi thinking disimpan bersama pada branch review fork `fix/configured-model-sync`; belum diajukan sebagai PR upstream. Snapshot fork bukan PR katalog minimal: pemisahan scope masih diperlukan bila diajukan ke upstream. Lihat `fork-snapshot-2026-10-14.md` untuk branch dan baseline. Verifikasi HTTP memakai scratch agent home ada di `test/catalog-sync.test.ts`; integrasi thinking sekarang ada di `test/thinking-sync.test.ts`.

## Tujuan

Perbaiki `/omni sync` agar picker tidak dipenuhi provider yang belum dikonfigurasi dan alias duplikat. Model chat yang memang tersedia menurut OmniRoute tetap dipertahankan, termasuk model baru, varian thinking, dan rute yang valid. Hindari overengineering dan pengujian panjang.

Repo: https://github.com/md-riaz/omniroute-pi-ext-integration
Checkout: `/home/alecto/Projects/omniroute-pi-ext-integration`

## Konteks dan bukti

- Instalasi lokal sebelumnya memakai paket `omniroute-pi-ext-integration` 2.0.1 dengan implementasi `index.ts`.
- Checkout upstream sudah memakai arsitektur multi-host `shared.ts`, `pi.ts`, `omp.ts`, dan `prime.ts`, dengan nama paket `omniroute-agent-extension`. Jangan menyalin seluruh file lama ke upstream.
- Katalog lokal awal memiliki 494 entri, termasuk `cxa/*` yang gagal dengan `503: Codex app-server transport is not configured (missing url or token)`.
- Saat investigasi berikutnya, endpoint biasa mengembalikan 787 entri; `?configuredOnly=true&prefix=canonical` mengembalikan 367. Jumlah ini adalah snapshot, bukan target pengujian.
- Respons terfilter masih memuat rute auto, no-think, provider tanpa autentikasi, dan model non-chat. Karena itu, jangan mengartikan `configuredOnly` sebagai jaminan akses akun atau sebagai persis daftar akun OAuth.
- Percobaan membaca `/api/providers` dengan inference API key ditolak HTTP 403. Jangan menambahkan ketergantungan pada endpoint admin atau database SQLite lokal.
- Patch minimal di paket terpasang sudah mengubah query katalog, memperbaiki filter non-chat, dan menolak hasil kosong/invalid sebelum menyimpan. Patch tersebut belum menjadi commit upstream.
- Upstream sudah memiliki include/exclude globs, startup sync, autosync opsional, dan model auto bawaan. Pertahankan mekanisme tersebut; tidak perlu membuat penggantinya.

## Lingkup perubahan minimal

### 1. Permintaan katalog di `shared.ts`

Di `fetchSyncedModels(config: OmniConfig, agentHome?: string): Promise<SyncedModel[]>`, ubah path permintaan dari:

```ts
"/v1/models"
```

menjadi:

```ts
"/v1/models?configuredOnly=true&prefix=canonical"
```

Gunakan penyaringan server dan nama canonical, bukan hardcode Antigravity/Kiro/Codex. Provider baru mengikuti katalog server saat sync berikutnya. Jangan membuat filter berdasarkan nama provider yang hanya diketahui dari instalasi pribadi.

Server lama mungkin mengabaikan parameter query. Dokumentasikan keterbatasan tersebut; jangan otomatis fallback ke katalog penuh ketika server mengembalikan error karena itu dapat memasukkan bloat lagi.

### 2. Filter non-chat di `shared.ts`

Perbaiki `isPiChatModel(model: OmniApiModel): boolean`:

- Tolak tipe yang jelas bukan chat: image, video, audio, classifier, embedding.
- Periksa output mentah sebelum modalitas yang tidak dikenal dibuang oleh normalisasi.
- Jika output eksplisit berisi hanya video/image/audio, jangan masukkan ke picker chat.
- Pertahankan model chat yang memiliki output text, termasuk multimodal dengan output text.
- Metadata output yang tidak tersedia tidak cukup untuk menyatakan model tidak valid; pertahankan kompatibilitas katalog tersebut.

### 3. Perlindungan daftar lama

Jika `data` bukan array atau katalog kosong, hentikan sync sebelum persistence. Jika setelah pemetaan tidak ada model chat, jangan mengganti daftar lama secara diam-diam. Evaluasi kebijakan hasil kosong untuk deployment yang memang sengaja tidak menyediakan model; jelaskan pesan error tanpa mengklaim server rusak.

Cukup gunakan alur error yang sudah ada. Jangan menambah framework backup, scheduler, konfigurasi baru, atau refactor persistence untuk PR ini.

### 4. Pertahankan model valid dan perilaku upstream

- Jangan membuang `auto/*`, `no-think/*`, atau varian `-low`, `-high`, `-max`, `-fast` hanya karena terlihat mirip.
- Pertahankan include/exclude globs eksplisit milik pengguna.
- Pertahankan auto models bawaan dan mapping harga, context, max tokens, reasoning, serta input.
- Jangan menambah provider kedua; provider host tetap `omni`.
- Semua host memakai jalur shared yang sama, termasuk manual sync, startup sync, dan tool sync.
- Jangan mengubah login, API key permissions, routing inference, telemetry, atau transport Codex.

## Dokumentasi dalam PR

- `README.md`: jelaskan penggunaan configured-only/canonical, perbedaan terdaftar vs dapat diakses, serta model valid yang tetap dipertahankan.
- `ARCHITECTURE.md`: perbarui alur sync dan penanganan katalog kosong/invalid.
- `AI.md`: perbarui ringkasan `fetchSyncedModels()` bila perilakunya berubah.
- Jangan membawa instruksi prompt-tool lama: upstream sekarang memakai native `openai-completions`. Beberapa bagian AGENTS/CONTRIBUTING masih menyebut arsitektur lama; jangan memperluas PR untuk membersihkan semuanya.

## Verifikasi singkat

Catat failure modes sebelum menulis implementasi: provider belum dikonfigurasi muncul, alias ganda, video lolos, model valid terbuang, respons rusak/kosong menimpa katalog, dan metadata hilang saat pemetaan.

Gunakan mekanisme pengujian yang sudah ada; jangan membuat suite panjang baru. Ikuti gate repo sebelum melaporkan implementasi selesai:

```bash
npm run typecheck
npm run smoke
npm test
```

Untuk bukti integrasi, jalankan sync sekali ke scratch agent home, bukan file katalog pribadi. Periksa bahwa query terfilter benar-benar dipakai, model chat yang dikembalikan tetap ada sesuai filter pengguna, model non-chat tidak ada, dan provider lain dalam models.json tidak berubah. Simpan ringkasan hitungan/prefix tanpa token atau kredensial. Jika gate gagal atau tidak dapat dijalankan, laporkan apa adanya.

## Urutan kontribusi

1. Buat branch, misalnya `fix/configured-model-sync`.
2. Cocokkan patch lokal dengan implementasi terbaru di `shared.ts`; jangan copy-paste arsitektur lama.
3. Catat failure modes dan lakukan perubahan minimal di fungsi katalog/filter.
4. Perbarui dokumentasi user-facing dalam perubahan yang sama.
5. Jalankan pemeriksaan singkat di atas; tinjau diff agar tidak ada secret/data akun.
6. Commit perubahan yang relevan, lalu fork/push dan buka PR setelah persetujuan pengguna.

Usulan judul PR: **Prefer configured canonical models during OmniRoute sync**.

## Kriteria selesai dan batas klaim

- Sync meminta katalog configured-only dengan canonical prefixes.
- Model chat valid tidak dihapus berdasarkan asumsi lokal atau nama varian.
- Model non-chat eksplisit tidak masuk picker chat.
- Katalog invalid/kosong tidak diam-diam menghapus daftar lama.
- Metadata dan dukungan Pi/OMP/Prime tetap utuh.
- Tidak ada akses admin, hardcode akun, dependensi baru, atau refactor di luar lingkup.
- Sync bukan pemeriksaan hak akses setiap model; keberhasilan inference tidak dijamin hanya dari katalog.

## Pekerjaan lanjutan terpisah: thinking mengikuti capability model dan rute

### Tujuan pengguna

Saat pengguna mengganti model dengan `/model`, pilihan thinking harus mengikuti kemampuan efektif model melalui provider/rute yang dipilih. Model Codex mengikuti kontrak Codex; model Kiro mengikuti kontrak Kiro; provider lain tidak mewarisi daftar effort OpenAI secara massal. Tetap gunakan provider host `omni` dan kontrol thinking host yang normal, tanpa daftar model/provider kedua.

Ini bukan sekadar membuka `xhigh` atau `max` di UI. Pilihan harus mencerminkan parameter yang benar-benar dapat dijalankan adapter. Bedakan effort native, preset budget token, on/off, dan alias yang menghasilkan nilai upstream sama.

### Bukti investigasi lokal

Snapshot instalasi OmniRoute paket 3.8.51 dan Pi 1.2.0; bukan kontrak semua versi atau bukti inference backend:

- Katalog configured-only/canonical mengembalikan 368 entri, 127 di antaranya memiliki `capabilities.effort_tiers`. Angka ini bukan target tes.
- Extension lokal menyimpan 195 model tanpa `thinkingLevelMap`. Checkout upstream juga hanya memetakan boolean reasoning, bukan daftar effort.
- Pi yang diperiksa menampilkan `off`, `minimal`, `low`, `medium`, dan `high` secara default untuk `reasoning:true`; `xhigh`/`max` perlu mapping eksplisit. Level yang tidak didukung perlu diisi `null`, termasuk level bawah. Pilihan `none` backend dapat dipetakan ke `off` host bila kontraknya mendukung.
- `codex/gpt-6.1-sol` hanya mengiklankan boolean reasoning, tanpa daftar effort. Executor Codex menggunakan batas fallback `xhigh` untuk model ini; itu batas implementasi yang ditemukan, bukan verifikasi kemampuan asli backend.
- `codex/gpt-5.5` mengiklankan `max`, tetapi executor Codex yang diperiksa membatasinya ke `xhigh`.
- `codex/gpt-6-sol` mengiklankan `ultra`, tetapi executor menerjemahkan `ultra` menjadi wire effort `max`. Jangan menganggap keduanya effort native yang berbeda.
- Pada jalur penerjemahan OpenAI ke Gemini yang diperiksa, `high`, `xhigh`, dan `max` memakai budget high yang sama, dibatasi cap model.
- Katalog sejumlah model Kiro sudah memiliki `effort_tiers`. Adapter Kiro menerima effort, tetapi sebagian penerjemahannya menggunakan arahan thinking dengan budget heuristik; jangan mengklaim seluruhnya sebagai effort native model.
- Katalog OmniRoute dapat memakai fallback daftar canonical bila capability tertentu tidak tersedia. Karena itu `effort_tiers` saja belum selalu membuktikan kemampuan native atau pilihan efektif yang berbeda.
- Executor Codex memberi prioritas forced rule server, lalu suffix effort model, lalu `reasoning.effort`, lalu `reasoning_effort`, lalu default koneksi. Varian `*-high` dapat mengalahkan pilihan thinking host; jangan menghapus varian, tetapi jelaskan atau representasikan penguncian effort tersebut.

Investigasi hanya membaca katalog dan source; tidak menjalankan inference berbayar, mengubah konfigurasi pribadi, membaca database akun, atau membuktikan penerimaan effort oleh backend.

### Sumber kebenaran dan batas tanggung jawab

Urutan sumber capability: discovery resmi provider bila tersedia; registry per model/rute berdasarkan dokumentasi provider bila discovery tidak tersedia; bukti runtime untuk mendeteksi ketidaksesuaian. Tidak semua provider menyediakan discovery daftar effort. Jangan melakukan probe berbayar semua level pada setiap sync.

Registry per model boleh diperlukan, tetapi tempatnya di OmniRoute, terpusat dan dipakai bersama oleh katalog serta executor. Jangan menduplikasi hardcode provider/model di extension. Pisahkan OpenAI API langsung dari backend Codex dan dari Kiro meskipun nama model mirip.

Target alur:

```text
capability model/provider + batas/penerjemahan adapter/rute
  -> resolver capability efektif OmniRoute
     -> katalog mengiklankan pilihan dan semantiknya
     -> executor memvalidasi/menerjemahkan pilihan dari sumber yang sama
  -> shared sync extension mempertahankan metadata
  -> mapping capability ke kontrol thinking host
  -> ganti /model memperbarui pilihan sesuai rute tersebut
```

Jika capability belum diketahui, tandai unknown; jangan mengarang dukungan semua tier. Kebijakan fallback host untuk unknown perlu diputuskan dan didokumentasikan sebelum implementasi. Model auto/combo yang memilih backend dinamis tidak boleh mewarisi capability satu model konkret tanpa kontrak resolver yang jelas.

### Urutan perubahan

1. Audit resolver, metadata katalog, sanitizer, executor, dan aturan override OmniRoute; cocokkan dengan kontrak provider. Gunakan satu sumber capability efektif, bukan daftar katalog dan clamp executor yang saling berbeda.
2. Tentukan kontrak metadata yang membedakan effort native, preset budget beserta batasnya, alias, unknown, dan effort terkunci oleh rute/varian. Nama field tambahan belum diputuskan; jangan menganggap proposal sebagai API yang sudah ada.
3. Perbaiki OmniRoute bila metadata tidak sesuai executor. Jangan mengiklankan tier yang selalu diturunkan atau memberi kesan beberapa pilihan berbeda padahal payload efektif sama.
4. Setelah kontrak jelas, buat perubahan extension terpisah: pertahankan metadata pada `OmniApiModel`, `SyncedModel`, `fetchSyncedModels()`, persistence/reload, dan `buildProviderModelConfig()`; petakan ke `thinkingLevelMap` serta konfigurasi pengiriman yang tepat.
5. Verifikasi dukungan host Pi/OMP/Prime masing-masing. Pi yang diperiksa memiliki kosakata tetap hingga `max`, tanpa `ultra`; jangan memaksakan level yang tidak dapat direpresentasikan atau mengklaim semua host memiliki kontrak identik. Budget yang dipetakan ke level host harus dijelaskan sebagai preset.
6. Perbarui README, ARCHITECTURE, dan AI dalam perubahan implementasi yang relevan. PR katalog minimal tetap terpisah dari perubahan capability OmniRoute dan integrasi thinking extension.

### Verifikasi dan kriteria selesai lanjutan

Catat failure modes sebelum implementasi: metadata hilang saat sync/reload, level unsupported tetap muncul, fallback dianggap authoritative, katalog berbeda dari executor, effort diturunkan tanpa penjelasan, suffix/forced rule mengalahkan pilihan host, alias dianggap tier native berbeda, budget melampaui cap, dan host memiliki kemampuan berbeda.

Gunakan pengujian routing/integrasi yang ada dan E2E terarah dengan scratch agent home. Buktikan pergantian model Codex ke Kiro mengubah pilihan berdasarkan capability masing-masing, bukan berdasarkan daftar global. Periksa payload hasil adapter, termasuk model berbasis budget dan varian effort terkunci; HTTP sukses atau UI yang menampilkan `max` saja bukan bukti effort diterapkan.

Artefak harus memuat ringkasan tersanitasi model/rute, sumber capability, pilihan host, parameter efektif setelah penerjemahan, dan batas klaim. Inference nyata hanya dengan izin dan kredensial yang sesuai; bila tidak dijalankan, nyatakan bahwa bukti berhenti pada routing/payload. Jangan menyimpan token, prompt pribadi, atau data akun. Jalankan gate repo yang relevan sebelum melaporkan implementasi selesai.

Selesai bila pilihan thinking mengikuti capability efektif setiap model/rute, metadata bertahan setelah sync/reload, katalog dan executor konsisten, serta keterbatasan unknown/budget/alias/host dijelaskan. Menambahkan `xhigh`/`max` secara massal atau hanya menyalin `effort_tiers` yang belum tervalidasi tidak memenuhi tujuan ini.
