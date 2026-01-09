# Auto Order Telegram Bot

Bot Telegram untuk kebutuhan auto order. Project ini berjalan di Node.js 22 dan menggunakan Telegraf untuk integrasi Telegram.

## Fitur Utama

- Auto order melalui Telegram.
- Konfigurasi via file `.env`.
- Logging dan scheduler (cron).
- Mendukung generate aset gambar (via `canvas`).

## Prasyarat

- Node.js 22+ dan npm.
- Token bot Telegram dari BotFather.
- MongoDB (lokal atau cloud).

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
- `TZ` — timezone, contoh `Asia/Jakarta`.
- `MONGODB_URI` — koneksi MongoDB, contoh `mongodb://localhost:27017`.
- `MONGODB_DB` — nama database MongoDB, contoh `auto_order`.
- `STORE_NICKNAME` — nama panggilan toko untuk label UI, contoh `SEN PRO`.
- `STORE_NAME` — nama toko untuk laporan pembayaran, contoh `Sphynixstore`.
- `PAYMENT_GATEWAY_LABEL` — label gateway untuk monitoring pembayaran, contoh `YSPAY`.
- `QR_STRING` — string QR jika diperlukan.
- `PAYMENT_EXPIRES_MINUTES` — batas waktu pembayaran (menit).
- `PAYMENT_GATEWAY` — nama payment gateway (contoh: `gopay`).
- `GOBIZ_EMAIL` — email akun GoBiz (jika digunakan).
- `GOBIZ_PASSWORD` — password akun GoBiz (jika digunakan).

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
docker run --env-file .env --name auto-order-telegram --restart unless-stopped -d auto-order-telegram:latest
```

### Melihat log container

```bash
docker logs -f auto-order-telegram
```

### Menghentikan container

```bash
docker stop auto-order-telegram
```
