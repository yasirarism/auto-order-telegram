# Auto Order Telegram Bot

Bot Telegram untuk kebutuhan auto order. Project ini berjalan di Node.js 22 dan menggunakan Telegraf untuk integrasi Telegram.

## Fitur Utama

- Auto order melalui Telegram.
- Konfigurasi via file `.env`.
- Logging dan scheduler (cron).
- Mendukung generate aset gambar (via `canvas`).
- Web storefront responsif untuk katalog dan checkout QRIS.
- Dashboard admin web untuk stok dan monitoring transaksi.
- Login pelanggan web melalui deep-link bot Telegram tanpa mengetik ID; data produk, stok, dan transaksi memakai penyimpanan yang sama dengan bot.

## Prasyarat

- Node.js 22+ dan npm.
- Token bot Telegram dari BotFather.
- MongoDB (opsional; jika tidak diisi akan pakai file lokal).

## Struktur Project (ringkas)

- `main.js` — entry point aplikasi.
- `settings.js` — konfigurasi aplikasi.
- `lib/` — logic utama bot.
- `utils/` — helper/utility.
- `assets/` — aset pendukung.

## Konfigurasi Environment

1. Salin konfigurasi env:
   ```bash
   cp .env.example .env
   ```
2. Isi nilai pada `.env` sesuai kebutuhan.

### Variabel `.env`

Berikut variabel penting yang tersedia di `.env.example`:

- `BOT_TOKEN` — token bot dari BotFather.
- `BOT_NAME` — nama bot (override `settings.js`).
- `BOT_VERSION` — versi bot (override `settings.js`).
- `BOT_AUTHOR` — nama author bot (override `settings.js`).
- `TZ` — timezone, contoh `Asia/Jakarta`.
- `MONGODB_URI` — koneksi MongoDB (opsional). Jika kosong, data disimpan ke file lokal.
- `MONGODB_DB` — nama database MongoDB (dipakai jika `MONGODB_URI` diisi), contoh `auto_order`.
- `STORE_NICKNAME` — nama panggilan toko untuk label UI, contoh `SEN PRO`.
- `STORE_NAME` — nama toko untuk laporan pembayaran, contoh `Sphynixstore`.
- `PAYMENT_GATEWAY_LABEL` — label gateway untuk monitoring pembayaran, contoh `YSPAY`.
- `QR_STRING` — string QR jika diperlukan.
- `PAYMENT_EXPIRES_MINUTES` — batas waktu pembayaran (menit).
- `PAYMENT_GATEWAY` — nama payment gateway (contoh: `gopay`).
- `GOBIZ_EMAIL` — email akun GoBiz (jika digunakan).
- `GOBIZ_PASSWORD` — password akun GoBiz (jika digunakan).
- `ADMIN_IDS` — daftar ID admin (pisahkan dengan koma).
- `ADMIN_USERNAMES` — daftar username admin (pisahkan dengan koma).
- `ADMIN_JSON` — JSON array admin (misalnya `[{"id":"123","username":"foo"}]`).
- `ALLOW_USER_CEK_SNK` — `true/false` untuk akses publik `/ceksnk`.

## Web UI

Web UI otomatis aktif tanpa variabel environment tambahan. Setelah aplikasi berjalan, buka `http://localhost:3000` (atau domain hosting). Jika hosting menyediakan `PORT`, aplikasi akan menggunakannya secara otomatis.

- **Store** menampilkan katalog dan stok real-time. Tombol login membuka bot melalui deep-link; setelah pengguna menekan **Start**, browser login otomatis tanpa memasukkan ID atau kode. Checkout kemudian menghasilkan QRIS dan akun tetap dikirim melalui Telegram.
- **Pesanan** menampilkan status transaksi web milik pelanggan.
- **Admin** memakai deep-link Telegram yang sama. Dashboard hanya terbuka jika akun Telegram terdaftar pada konfigurasi admin bot (`ADMIN_IDS`/`settings.js`), dan menyediakan ringkasan, tabel stok/transaksi, serta form tambah stok dengan format satu akun per baris: `email|password|catatan`.

Bot dan web membaca `products.json`, `transactions.json`, `db.json`, dan folder `stok/` melalui store yang sama (termasuk MongoDB bila dikonfigurasi), jadi tidak ada database web terpisah yang perlu disinkronkan.

Untuk deployment Docker, port container harus dipublikasikan dengan `-p 3000:3000`. Setelah itu web dapat dibuka melalui `http://IP-VPS:3000`; pastikan firewall VPS mengizinkan TCP port 3000, atau arahkan reverse proxy Nginx/Caddy ke `127.0.0.1:3000`. Endpoint pengecekan tersedia di `/health`.

## Menjalankan secara lokal

```bash
npm install
npm start
```

Untuk mode development (log lebih verbose):

```bash
npm run dev
```

## Deploy dengan Docker (Node.js 22)

### Build image

```bash
docker build -t auto-order-telegram:latest .
```

### Menjalankan container

```bash
docker run --env-file .env -p 3000:3000 --name auto-order-telegram --restart unless-stopped -d auto-order-telegram:latest
```

### Melihat log container

```bash
docker logs -f auto-order-telegram
```

### Menghentikan container

```bash
docker stop auto-order-telegram
```
