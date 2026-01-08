# Auto Order Telegram Bot (GoPay Merchant)

Bot Telegram untuk auto-order yang terintegrasi dengan pembayaran **GoPay Merchant (GoBiz)** melalui QRIS.

## Fitur Utama
- Auto order produk berbasis stok.
- Integrasi pembayaran QRIS via GoPay Merchant (GoBiz).
- Manajemen produk & stok via command bot.

## Prasyarat
- Node.js 18+ (atau gunakan Docker).
- Akun GoBiz (GoPay Merchant) aktif.
- Bot Telegram dari @BotFather.

## Konfigurasi
1. Duplikasi file environment:
   ```bash
   cp .env.example .env
   ```
2. Lengkapi `.env`:
   - `BOT_TOKEN`: Token bot Telegram.
   - `TZ`: Zona waktu (contoh: `Asia/Jakarta`).
   - `QR_STRING`: String QRIS statis dari GoPay Merchant.
   - `PAYMENT_EXPIRES_MINUTES`: Masa berlaku pembayaran (menit).
   - `PAYMENT_GATEWAY`: Biarkan `gopay`.
   - `GOBIZ_EMAIL` dan `GOBIZ_PASSWORD`: Kredensial GoBiz untuk cek status pembayaran.

3. Update `settings.js`:
   - `info.BOT_NAME`, `info.AUTHOR`
   - `admins` (id/username admin Telegram)

## Struktur Data Lokal
Bot menyimpan data ke direktori berikut:
- `data/` (database JSON)
- `stok/` (stok per produk)

Buat struktur awal:
```bash
mkdir -p data stok
printf '[]' > data/transactions.json
printf '[]' > data/products.json
printf '[]' > data/orders.json
printf '[]' > data/db.json
printf '{}' > data/bot-config.json
```

## Menjalankan Secara Lokal
```bash
npm install
npm start
```

## Menjalankan Dengan Docker
### Build Image
```bash
docker build -t auto-order-telegram .
```

### Run Container
```bash
docker run --rm -it \
  --env-file .env \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/stok:/app/stok \
  auto-order-telegram
```

## Catatan GoPay Merchant (GoBiz)
- `QR_STRING` harus berisi QRIS statis milik merchant agar QR dinamis bisa digenerate.
- Pastikan akun GoBiz memiliki akses ke fitur QRIS Merchant.

## Lisensi
Proyek ini mengikuti lisensi yang tercantum di `package.json`.
