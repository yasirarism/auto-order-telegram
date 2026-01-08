# Auto Order Telegram Bot

Bot Telegram untuk kebutuhan auto order. Project ini dijalankan dengan Node.js 22.

## Persiapan

1. Salin konfigurasi env:
   ```bash
   cp .env.example .env
   ```
2. Isi nilai pada `.env` sesuai kebutuhan (token bot, timezone, dsb).

## Menjalankan secara lokal

```bash
npm install
npm start
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

### Menghentikan container

```bash
docker stop auto-order-telegram
```
