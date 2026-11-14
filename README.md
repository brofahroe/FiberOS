# ⚡ FiberOS - FTTH Rollout Progress Monitoring

Aplikasi modern untuk monitoring, pelaporan progres harian, dan manajemen BOQ proyek penarikan kabel dan penanaman tiang Fiber Optik (FTTH Rollout).

---

## 🚀 Fitur Utama

1. **Dashboard Monitoring Real-time**
   - KPI Progres Total (%), Realisasi vs BOQ.
   - Ringkasan Home Passes (HP) dan status cluster.
   - Breakdown per Kategori: Tiang (*Pole*), Kabel Distribusi/Feeder, Perangkat FAT & FDT, dan Aksesoris.
   - Kartu progres per cluster dengan indikator status otomatis.

2. **Form Input Harian Mobile-First (`/daily-input`)**
   - Dirancang khusus untuk kemudahan input teknisi / supervisor di lapangan via smartphone.
   - Pilih Cluster & Tanggal -> Otomatis menampilkan item pekerjaan, target BOQ, terpasang sebelumnya, dan sisa volume.
   - Laporan dibedakan per tim untuk cluster dan tanggal yang sama; ringkasan progres, Matriks, Excel, dan WhatsApp tetap digabung per cluster.
   - Validasi angka real-time (peringatan jika input melebihi sisa BOQ).
   - Catatan kendala lapangan (cuaca hujan, izin warga, kendala jalur PLN).
   - **Kompresi Foto Otomatis:** Foto kamera HP langsung dikompres di browser sebelum diunggah sehingga hemat kuota dan cepat walau sinyal minim.

3. **Matriks Progres Harian & Ekspor Excel (`/matrix`)**
   - Tampilan tabel matriks pivot (Cluster x HP x Item x Tanggal harian x Total x BOQ x Sisa x %).
   - Filter cepat berdasarkan cluster atau pencarian item.
   - **Tombol 1-Klik "Export to Excel (.xlsx)":** Menghasilkan file spreadsheet persis seperti Google Spreadsheet resmi proyek.
   - Koreksi sel harian dinonaktifkan jika pada cluster dan tanggal tersebut ada laporan dari beberapa tim.

4. **Menu Impor BOQ (`/import-boq`)**
   - Unggah langsung file Excel resmi format APD (`*_BOQ_APD(CLUSTER).xlsx` dan `*_BOQ_APD(SUBFEEDER).xlsx`).
   - Otomatis mendeteksi nama cluster, sheet BoQ, dan mengekstrak seluruh item volume material/jasa.
   - Pratinjau (*preview*) tabel sebelum disimpan ke database.

5. **Master Data Cluster & BOQ (`/clusters`)**
   - Kelola daftar cluster, kapasitas Home Pass, dan target BOQ tiap item.

---

## 🛠️ Cara Menjalankan Aplikasi

### 1. Menjalankan di Komputer Lokal
Jalankan ESLint untuk memeriksa kode:
```bash
npm run lint
```

Jalankan aplikasi:
```bash
npm run dev
```
Buka browser di: `http://localhost:3000`

### 2. Mengakses dari HP Teknisi Lapangan (Dalam 1 Jaringan Wi-Fi / Hotspot)
Jalankan server dengan host bind `0.0.0.0`:
```bash
npm run dev -- -H 0.0.0.0
```
Lalu di HP teknisi, buka browser Chrome/Safari dan akses:
`http://<IP_KOMPUTER_ANDA>:3000` (contoh: `http://192.168.1.50:3000`)

---

## 🗄️ Basis Data

- Basis data menggunakan **SQLite** via **Prisma ORM** yang tersimpan di file `prisma/fiberos.db`.
- Seluruh data 15 Cluster proyek *Kedungtuban Blora* beserta histori progres harian sudah tersimpan secara lengkap di dalam database.
- Untuk mengulang migrasi atau reset data awal dari file spreadsheet:
  ```bash
  node scripts/seed.mjs
  ```

