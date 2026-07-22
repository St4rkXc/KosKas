# KosKas — Personal Finance Tracker untuk Disiplin Budget Bulanan

Aplikasi web single-page untuk melacak pengeluaran pribadi dengan pendekatan pocket-based budgeting. KosKas membantu Anda mengalokasikan pendapatan bulanan ke dalam kategori "pocket" (Pangan, Kos, Transportasi, Lifestyle, Dana Darurat, Tabungan, dll.) dan memantau pengeluaran harian secara real-time dengan sistem rollover otomatis untuk sisa budget pangan.

## ✨ Fitur Utama

- **Pocket-Based Budgeting** — Alokasikan pendapatan bulanan ke dalam kategori pengeluaran yang dapat dikustomisasi
- **Sistem Pocket Default** — 7 pocket sistem yang tidak dapat dihapus: Pangan, Fixed/Kos, Transportasi, Lifestyle, Dana Darurat, Tabungan, dan Sisa Pangan
- **Custom Pockets** — Buat pocket kustom dengan ikon dan warna pilihan Anda
- **Pelacakan Pengeluaran** — Catat pengeluaran dengan keypad numerik cepat dan pemilihan pocket
- **Transfer Antar Pocket** — Pindahkan saldo antar pocket sesuai kebutuhan
- **Rollover Pangan Otomatis** — Sistem otomatis menghitung dan memindahkan sisa budget harian pangan ke pocket "Sisa Pangan"
- **Dashboard Real-Time** — Lihat saldo tersisa per pocket, progress bar visual, dan status over-budget
- **Statistik Harian Pangan** — Pantau target pengeluaran pangan harian dan sisa budget
- **Persistent Storage** — Semua data tersimpan di localStorage browser (tidak perlu backend)
- **Dark Tactical UI** — Desain neon-minimalist dengan estetika tactical untuk pengalaman visual yang fokus
- **Responsive Design** — Optimal untuk mobile dan desktop dengan custom breakpoints
- **Haptic Feedback** — Getaran pada interaksi untuk pengalaman mobile yang lebih immersive (perangkat yang mendukung)

## 📋 Prasyarat

- **Node.js** — versi 18 atau lebih tinggi
- **pnpm** — versi 10.28.0 atau lebih tinggi

Install pnpm secara global jika belum tersedia:

```bash
npm install -g pnpm@10.28.0
```

## 🚀 Instalasi & Menjalankan Aplikasi

### 1. Clone Repository

```bash
git clone <repository-url>
cd koskas
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Konfigurasi Environment Variables (Opsional)

Copy file `.env.example` ke `.env.local` dan isi jika diperlukan:

```bash
cp .env.example .env.local
```

Variables yang tersedia:
- `GEMINI_API_KEY` — Untuk integrasi Gemini AI (otomatis di-inject di AI Studio)
- `APP_URL` — URL aplikasi (otomatis di-inject di AI Studio)

**Catatan:** Untuk penggunaan lokal standalone, kedua variable ini tidak diperlukan karena KosKas tidak memerlukan backend.

### 4. Jalankan Development Server

```bash
pnpm dev
```

Aplikasi akan berjalan di `http://localhost:3000`

### 5. Build untuk Production

```bash
pnpm build
```

Output akan tersedia di folder `dist/`

### 6. Preview Production Build

```bash
pnpm preview
```

### 7. Type Checking

```bash
pnpm lint
```

Menjalankan TypeScript type checking tanpa emit file.

## 📖 Cara Menggunakan

### Memulai dengan Pocket System

Saat pertama kali membuka KosKas, Anda akan melihat 7 pocket default:

1. **Pangan** — Budget makan harian (Rp 1.500.000 default)
2. **Fixed / Kos** — Biaya tempat tinggal (Rp 1.000.000 default)
3. **Transportasi** — Biaya transportasi (Rp 300.000 default)
4. **Lifestyle** — Gaya hidup & hiburan (Rp 300.000 default)
5. **Dana Darurat** — Tabungan darurat (Rp 200.000 default)
6. **Tabungan** — Sisa saldo yang tidak dialokasikan (otomatis)
7. **Sisa Pangan** — Rollover budget pangan harian (otomatis)

### Mengatur Alokasi Budget Bulanan

1. Klik tombol **"Alokasi"** di pojok kanan bawah
2. Atur **Total Saldo Bulanan** (income bulanan Anda)
3. Atur alokasi untuk setiap pocket sesuai kebutuhan
4. Pocket **Tabungan** akan otomatis menerima sisa saldo yang tidak dialokasikan
5. Klik **"Simpan Alokasi"** untuk menerapkan

**Tips:** Total alokasi tidak boleh melebihi Total Saldo Bulanan.

### Mencatat Pengeluaran

1. Klik tombol **FAB hijau (+)** di pojok kanan bawah
2. Pilih pocket tujuan pengeluaran (Pangan, Kos, Transportasi, dll.)
3. Masukkan jumlah menggunakan keypad numerik
4. Klik **"Simpan"**

Pengeluaran akan langsung mengurangi saldo pocket yang dipilih.

### Transfer Antar Pocket

Jika Anda perlu memindahkan saldo antar pocket:

1. Klik tombol **"Transfer"** di pojok kanan bawah
2. Pilih pocket sumber (Dari Pocket)
3. Pilih pocket tujuan (Ke Pocket)
4. Masukkan jumlah transfer
5. Tambahkan catatan (opsional)
6. Klik **"Lakukan Transfer"**

**Validasi:** Jumlah transfer tidak boleh melebihi saldo pocket sumber.

### Menghapus Pocket Kustom

Untuk pocket yang Anda buat sendiri (bukan pocket sistem):

1. Buka **Alokasi** settings
2. Cari pocket yang ingin dihapus
3. Klik ikon **Trash** di sebelah nama pocket
4. Konfirmasi penghapusan

**Catatan:** Sisa saldo akan otomatis dipindahkan ke pocket Tabungan.

### Memahami Rollover Pangan

KosKas secara otomatis menghitung rollover budget pangan harian:

- Target harian = `Alokasi Pangan / Jumlah hari dalam bulan`
- Setiap hari yang sudah lewat, sistem menghitung sisa budget yang tidak terpakai
- Sisa budget dipindahkan ke pocket **Sisa Pangan**
- Rollover dihitung ulang setiap kali ada transaksi baru

**Contoh:**
- Alokasi Pangan: Rp 1.500.000
- Hari dalam bulan: 30
- Target harian: Rp 50.000
- Jika hari ini Anda hanya menghabiskan Rp 35.000, maka Rp 15.000 akan di-rollover ke Sisa Pangan

### Reset Bulanan

Untuk memulai bulan baru:

1. Klik ikon **Settings** di header
2. Klik **"Aktivitas Terakhir"** untuk melihat riwayat
3. Klik tombol **"Reset"**
4. Konfirmasi reset

**Peringatan:** Semua transaksi dan transfer akan dihapus. Pocket settings tetap tersimpan.

### Melihat Riwayat Transaksi

1. Klik ikon **Settings** di header
2. Toggle **"Aktivitas Terakhir"** untuk melihat daftar transaksi
3. Hover pada transaksi untuk melihat tombol hapus
4. Klik ikon **Trash** untuk menghapus transaksi tertentu

## ⚙️ Konfigurasi

### Custom Breakpoints

KosKas menggunakan custom breakpoints alih-alih standar Tailwind:

| Breakpoint | Lebar | Penggunaan |
|------------|-------|------------|
| `mobile-sm` | 480px | Mobile kecil |
| `mobile` | 640px | Mobile standar |
| `tablet` | 768px | Tablet |
| `laptop-sm` | 1024px | Laptop kecil |
| `laptop` | 1280px | Laptop standar |
| `desktop` | 1440px | Desktop |
| `desktop-lg` | 1600px | Desktop besar |

### Design System

#### Warna

- **Background Primary:** `#050505` (hitam pekat)
- **Background Surface:** `#121212` (hitam permukaan)
- **Text Primary:** `#FAFAFA` (putih)
- **Text Muted:** `#71717A` (abu-abu)
- **Neon Safe:** `#10B981` (hijau — status aman)
- **Neon Warn:** `#F59E0B` (amber — warning)
- **Neon Danger:** `#EF4444` (merah — over budget)
- **Neon Vault:** `#8B5CF6` (ungu — tabungan)

#### Font

- **Sans-serif:** Inter (body text)
- **Monospace:** JetBrains Mono (angka & data)

### LocalStorage Keys

KosKas menyimpan data di browser dengan keys berikut:

- `koskas_transactions` — Daftar transaksi
- `koskas_pockets` — Konfigurasi pocket
- `koskas_month_start` — Timestamp awal bulan

**Legacy Migration:** Sistem otomatis migrasi dari key lama `koskas_expenses` dan `koskas_budgets` jika ditemukan.

## 🛠️ Tech Stack

| Teknologi | Versi | Purpose |
|-----------|-------|---------|
| **Vue** | 3.5 | Frontend framework dengan Composition API |
| **Pinia** | 4.0 | State management (composition store pattern) |
| **TypeScript** | 5.8 | Type safety |
| **Tailwind CSS** | 4.1 | Utility-first CSS framework |
| **Vite** | 6.2 | Build tool & dev server |
| **lucide-vue-next** | 1.0 | Icon library |
| **pnpm** | 10.28 | Package manager |

### Dependencies vs DevDependencies

**Runtime Dependencies:**
- `@google/genai` — Gemini AI integration (tidak digunakan di core app)
- `@tailwindcss/vite` — Tailwind plugin untuk Vite
- `@vueuse/core` — Vue composition utilities (tidak digunakan)
- `dotenv` — Environment variable loader (tidak digunakan)
- `express` — Web server (tidak digunakan)
- `lucide-vue-next` — Icons
- `pinia` — State management
- `vite` — Build tool (seharusnya di devDependencies)
- `vue` — Framework

**Development Dependencies:**
- `@types/express` — TypeScript types untuk Express
- `@types/node` — TypeScript types untuk Node.js
- `@vitejs/plugin-vue` — Vue plugin untuk Vite
- `@vue/compiler-sfc` — Vue SFC compiler
- `autoprefixer` — CSS vendor prefixer
- `esbuild` — JavaScript bundler
- `tailwindcss` — CSS framework
- `tsx` — TypeScript execution
- `typescript` — TypeScript compiler
- `vite` — Build tool (duplikat dari dependencies)
- `vue-tsc` — Vue TypeScript checker

## 🏗️ Build & Deploy

### Local Development

```bash
pnpm dev
```

Development server dengan HMR (Hot Module Replacement) di port 3000.

### Production Build

```bash
pnpm build
```

Output: folder `dist/` dengan file-file yang sudah di-optimize.

### Deploy ke Static Hosting

File di folder `dist/` dapat di-deploy ke static hosting manapun:

- **Vercel** — Drag & drop folder `dist/` atau connect repository
- **Netlify** — Upload folder `dist/` atau connect repository
- **GitHub Pages** — Push folder `dist/` ke branch `gh-pages`
- **Cloudflare Pages** — Connect repository atau upload folder
- **Firebase Hosting** — `firebase deploy --only hosting`

### Deploy ke AI Studio

KosKas dapat di-deploy ke Google AI Studio:

1. Push code ke repository
2. Buka AI Studio Apps: https://ai.studio/apps
3. Import repository
4. AI Studio akan otomatis build dan deploy

## 📱 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

**Note:** Haptic feedback hanya tersedia di perangkat mobile yang mendukung `navigator.vibrate()`.

## 🐛 Known Limitations

### 1. Bug pada `deletePocket`
Saat menghapus pocket, transfer untuk preserve balance dapat ter-korupsi karena `fromPocketId` di-rewrite. Ini menyebabkan saldo yang ditransfer tidak akurat.

### 2. Performa Rollover Calculation
Fungsi `updateRollovers` memiliki kompleksitas O(days × transactions) dan dijalankan pada setiap mutasi. Pada mobile device dengan banyak transaksi, dapat menyebabkan lag.

### 3. Triple Scan pada `pocketBalances`
Computed property `pocketBalances` melakukan 3 full scan transaksi per pocket setiap kali diakses. Dengan 7 pocket dan 100 transaksi, ini berarti 2100 iterasi.

### 4. Tidak Ada Batas Input pada Keypad
Input numerik pada keypad tidak memiliki batas panjang, berpotensi menyebabkan integer overflow pada angka yang sangat besar.

### 5. Ambiguitas Timestamp pada Rollover
Rollover transactions dengan timestamp yang sama dengan expense lain dapat menyebabkan urutan sorting yang tidak konsisten.

### 6. Duplikasi `vite` di Dependencies
Package `vite` terdaftar di kedua `dependencies` dan `devDependencies`, menyebabkan redundancy.

### 7. Script `clean` Tidak Kompatibel Windows
Script `pnpm clean` menggunakan `rm -rf` yang hanya bekerja di Unix/Linux/macOS, tidak di Windows.

### 8. Nama Package Masih "react-example"
`package.json` masih memiliki nama `"react-example"` (sisa dari template), seharusnya `"koskas"`.

### 9. Unused Dependencies
Beberapa dependencies tidak digunakan di bundle:
- `@google/genai`
- `dotenv`
- `express`
- `@vueuse/core`

### 10. Computed `totalSpent` Tidak Digunakan
Computed property `totalSpent` didefinisikan di store tetapi tidak digunakan di komponen manapun.

## 🔮 Future Improvements

### High Priority
- **Fix `deletePocket` bug** — Perbaiki logika transfer balance preservation
- **Optimize `updateRollovers`** — Gunakan memoization atau virtual scrolling untuk performa
- **Optimize `pocketBalances`** — Implementasi single-pass algorithm untuk kalkulasi balance
- **Add input length cap** — Batasi input keypad ke 12 digit untuk mencegah overflow
- **Fix Windows compatibility** — Ganti script `clean` dengan cross-platform solution (rimraf)

### Medium Priority
- **Clean up dependencies** — Hapus unused dependencies dan pindahkan `vite` ke devDependencies
- **Rename package** — Ganti nama package dari "react-example" ke "koskas"
- **Remove unused computed** — Hapus atau implementasikan penggunaan `totalSpent`
- **Add data export** — Fitur export/import data ke JSON untuk backup
- **Add charts/graphs** — Visualisasi pengeluaran dengan chart

### Low Priority
- **Add categories per pocket** — Sub-kategori dalam setiap pocket
- **Recurring transactions** — Pengeluaran rutin otomatis
- **Budget alerts** — Notifikasi saat mendekati limit pocket
- **Multi-currency support** — Dukungan untuk mata uang selain IDR
- **Dark/Light theme toggle** — Opsi untuk light mode
- **PWA support** — Installable app dengan offline support
- **Cloud sync** — Sync data antar perangkat

## 📄 License

Tidak ada lisensi yang ditentukan. Untuk informasi lebih lanjut, hubungi maintainer repository.

## 🤝 Contributing

Kontribusi diterima! Silakan fork repository dan buat pull request dengan perubahan Anda.

Untuk pertanyaan atau issue, silakan buka issue di GitHub repository.

## 🙏 Acknowledgments

- Dibangun dengan **Vue 3** dan **Pinia**
- Styling dengan **Tailwind CSS**
- Icons dari **Lucide**
- Design terinspirasi dari tactical/neon aesthetic

---

**Dibuat dengan ❤️ untuk disiplin finansial bulanan**

Versi: 3.2-TACTICAL
