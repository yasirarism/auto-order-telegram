# FastAPI + Pyrogram GoPay Merchant Template

Template ini melengkapi flow end-to-end seperti di Node.js:

1. Generate nominal unik + QRIS dinamis
2. Kirim QR ke user (Telegram via Pyrogram)
3. Polling status payment ke GoBiz (`journals/search`)
4. Auto update status `pending` / `paid` / `expired`
5. Warning timeout saat sisa waktu <= 60 detik

## Struktur

- `app/main.py` : endpoint FastAPI
- `app/config.py` : settings env
- `app/storage.py` : state store untuk token GoBiz
- `app/transaction_store.py` : sample store transaksi bot
- `app/qris.py` : generator QRIS dinamis (CRC16)
- `app/gopay_client.py` : HTTP client ke GoBiz
- `app/gateway_service.py` : auth + jurnal + check status
- `bot_pyrogram_sample.py` : sample bot `/buy <nominal>`

## Install

```bash
cd fastapi_template
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## 1) Menjalankan FastAPI

```bash
uvicorn app.main:app --reload --port 8000
```

Endpoint:
- `GET /health`
- `POST /gopay/auth/refresh`
- `POST /gopay/check-status`

## 2) Menjalankan sample bot Pyrogram

Isi `.env`:
- `BOT_TOKEN`, `API_ID`, `API_HASH`
- `QR_STRING` (QRIS statis merchant)
- `GOBIZ_EMAIL`, `GOBIZ_PASSWORD` (atau token existing)

Lalu run:

```bash
python bot_pyrogram_sample.py
```

Perintah bot:
- `/start`
- `/buy 15000`

## Flow `/buy 15000`

- Bot cari nominal unik (cek pending lokal + cek jurnal GoBiz)
- Bot generate QRIS dinamis dari `QR_STRING`
- Bot kirim gambar QR + caption pending bergaya box
- Background loop cek status tiap 5 detik
  - jika ada payment match: edit caption jadi berhasil
  - jika timeout: edit caption jadi kadaluarsa
  - jika sisa <=60 detik: kirim warning

## Catatan

- Ini template sample, bukan sistem produksi final.
- Untuk produksi, sebaiknya:
  - pindahkan store ke DB (PostgreSQL/Redis)
  - tambah retry + observability
  - batasi rate polling dan tambahkan lock/distributed worker
