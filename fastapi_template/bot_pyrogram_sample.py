import asyncio
import random
import time
from datetime import datetime
from io import BytesIO

from pyrogram import Client, filters
from app.config import settings
from app.gateway_service import service
from app.qris import QRIS
from app.transaction_store import TransactionStore

store = TransactionStore()


def format_rp(amount: int) -> str:
    return f"Rp{amount:,.0f}".replace(",", ".")


def now_wib() -> str:
    return datetime.now().strftime("%d-%m-%Y %H:%M:%S") + " WIB"


def make_ref() -> str:
    today = datetime.now().strftime("%Y%m%d")
    return f"{settings.payment_gateway_label}-{today}-{random.randint(100000, 999999)}"


def pending_caption(ref_id: str, amount: int, expiry_at: int) -> str:
    remaining = max(0, int((expiry_at - int(time.time() * 1000)) / 1000))
    return "\n".join([
        "╭───────────────────────╮",
        "├ <b>🧾 MENUNGGU PEMBAYARAN</b>",
        f"├ <b>{settings.payment_gateway_label} ID:</b>",
        f"├ {ref_id}",
        "├ - - - - - - - - - - - - - - - -",
        f"├ <b>Total Bayar:</b> {format_rp(amount)}",
        "├ <b>Metode:</b> QRIS",
        f"├ <b>Expired:</b> {remaining} detik",
        "╰───────────────────────╯",
        "",
        "Silakan scan QR di atas lalu tunggu konfirmasi otomatis.",
    ])


def paid_caption(ref_id: str, amount: int, provider_ref: str | None) -> str:
    return "\n".join([
        "╭───────────────────────╮",
        "├ <b>✅PEMBAYARAN BERHASIL✅</b>",
        f"├ <b>{settings.payment_gateway_label} ID:</b>",
        f"├ {ref_id}",
        "├ - - - - - - - - - - - - - - - -",
        f"├ <b>Total Bayar:</b> {format_rp(amount)}",
        f"├ <b>Provider Ref:</b> {provider_ref or '-'}",
        f"├ <b>Waktu:</b> {now_wib()}",
        "╰───────────────────────╯",
    ])


def expired_caption(ref_id: str, amount: int) -> str:
    return "\n".join([
        "╭───────────────────────╮",
        "├ <b>❌ PEMBAYARAN KADALUARSA</b>",
        f"├ <b>{settings.payment_gateway_label} ID:</b>",
        f"├ {ref_id}",
        "├ - - - - - - - - - - - - - - - -",
        f"├ <b>Total Bayar:</b> {format_rp(amount)}",
        f"├ <b>Waktu:</b> {now_wib()}",
        "╰───────────────────────╯",
        "",
        "Buat order baru untuk mendapatkan QR baru.",
    ])


def generate_unique_amount(base_amount: int) -> int:
    now = int(time.time() * 1000)
    window_start = now - settings.payment_expires_minutes * 60 * 1000

    amount = int(base_amount)
    for _ in range(1000):
        local_collision = any(
            int(t.get("total_amount", 0)) == amount and int(t.get("created_at", 0)) >= window_start
            for t in store.list_pending()
        )
        if local_collision:
            amount += 1
            continue

        remote = service.search_journals_relative(
            start_ms=window_start,
            end_ms=now,
            amount_eq=amount,
            size=1,
        )
        has_remote = bool((remote or {}).get("hits"))
        if not has_remote:
            return amount
        amount += 1

    raise RuntimeError("failed to generate unique amount")


app = Client(
    "gopay-bot-sample",
    bot_token=settings.bot_token,
    api_id=settings.api_id,
    api_hash=settings.api_hash,
)


@app.on_message(filters.command("start"))
async def start_handler(client: Client, message):
    await message.reply_text(
        "Halo! Gunakan /buy <nominal>\nContoh: /buy 15000", quote=True
    )


@app.on_message(filters.command("buy"))
async def buy_handler(client: Client, message):
    try:
        parts = (message.text or "").split()
        if len(parts) < 2:
            await message.reply_text("Format: /buy 15000")
            return

        base_amount = int(parts[1])
        if base_amount <= 0:
            await message.reply_text("Nominal harus lebih dari 0")
            return

        total_amount = generate_unique_amount(base_amount)
        ref_id = make_ref()
        now = int(time.time() * 1000)
        expiry_at = now + settings.payment_expires_minutes * 60 * 1000

        qris = QRIS(total_amount, settings.qr_string)
        image_bytes = qris.to_png_bytes()
        file = BytesIO(image_bytes)
        file.name = f"qris-{ref_id}.png"

        sent = await client.send_photo(
            chat_id=message.chat.id,
            photo=file,
            caption=pending_caption(ref_id, total_amount, expiry_at),
            parse_mode="html",
        )

        store.add(
            {
                "user_id": message.from_user.id if message.from_user else 0,
                "chat_id": message.chat.id,
                "message_id": sent.id,
                "status": "pending",
                "reference_id": ref_id,
                "amount": base_amount,
                "total_amount": total_amount,
                "created_at": now,
                "expires_at": expiry_at,
                "provider_ref": None,
                "warn_sent": False,
            }
        )
    except Exception as e:
        await message.reply_text(f"Gagal create payment: {e}")


async def monitor_pending_loop(client: Client):
    while True:
        await asyncio.sleep(5)
        pending_rows = store.list_pending()

        for row in pending_rows:
            try:
                check = service.check_status(
                    base_total_amount=int(row["total_amount"]),
                    created_at=int(row["created_at"]),
                    expiry_at=int(row["expires_at"]),
                )

                new_status = check.get("status", "pending")
                if new_status == "pending":
                    remain_sec = max(0, int((int(row["expires_at"]) - int(time.time() * 1000)) / 1000))
                    if remain_sec <= 60 and not row.get("warn_sent"):
                        await client.send_message(
                            row["chat_id"],
                            f"⚠️ <b>Peringatan:</b> pembayaran {row['reference_id']} sisa {remain_sec} detik.",
                            parse_mode="html",
                        )
                        store.update(row["id"], {"warn_sent": True})
                    continue

                if new_status == "paid":
                    caption = paid_caption(row["reference_id"], int(row["total_amount"]), check.get("provider_ref"))
                    store.update(row["id"], {"status": "paid", "provider_ref": check.get("provider_ref")})
                else:
                    caption = expired_caption(row["reference_id"], int(row["total_amount"]))
                    store.update(row["id"], {"status": "expired"})

                await client.edit_message_caption(
                    chat_id=row["chat_id"],
                    message_id=row["message_id"],
                    caption=caption,
                    parse_mode="html",
                )
            except Exception:
                continue


async def main():
    await app.start()
    asyncio.create_task(monitor_pending_loop(app))
    print("Pyrogram sample bot running...")
    await asyncio.Event().wait()


if __name__ == "__main__":
    if not settings.bot_token or not settings.api_id or not settings.api_hash:
        raise RuntimeError("BOT_TOKEN, API_ID, API_HASH wajib diisi pada .env")

    asyncio.run(main())
