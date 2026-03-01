# FastAPI GoPay Merchant Template

Template ini mereplikasi konsep dari script Node.js di repo ini:

1. Auth GoBiz (password / refresh token)
2. Simpan `access_token`, `refresh_token`, `merchant_id`
3. Cek status pembayaran via `journals/search` (berdasarkan amount + waktu + merchant)
4. Endpoint HTTP untuk dipakai script/project Python lain

## Struktur

- `app/main.py` : entrypoint FastAPI
- `app/config.py` : env settings
- `app/storage.py` : file-based credential/token storage
- `app/gopay_client.py` : HTTP client GoBiz
- `app/gateway_service.py` : business logic auth + cek status
- `.env.example` : variabel lingkungan
- `requirements.txt` : dependencies

## Menjalankan

```bash
cd fastapi_template
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Endpoint

- `GET /health`
- `POST /gopay/auth/refresh`
- `POST /gopay/check-status`

Contoh body `POST /gopay/check-status`:

```json
{
  "base_total_amount": 15000,
  "created_at": 1730809200000,
  "expiry_at": 1730810100000
}
```

Response:

```json
{
  "status": "pending",
  "amount": 15000,
  "provider_ref": null
}
```
