from __future__ import annotations

from io import BytesIO

import qrcode


class QRIS:
    def __init__(self, amount: int, qr_string: str):
        if not qr_string:
            raise ValueError("QR_STRING is required")

        static_qris = qr_string
        updated_qris = static_qris[:-4]
        step1 = updated_qris.replace("010211", "010212")
        step2 = step1.split("5802ID")

        uang = f"54{str(len(str(amount))).zfill(2)}{amount}5802ID"
        dynamic_qris = step2[0] + uang + step2[1]

        crc = 0xFFFF
        for ch in dynamic_qris:
            crc ^= ord(ch) << 8
            for _ in range(8):
                crc = ((crc << 1) ^ 0x1021) if (crc & 0x8000) else (crc << 1)
                crc &= 0xFFFF

        dynamic_qris += format(crc, "04X")
        self.value = dynamic_qris

    def to_string(self) -> str:
        return self.value

    def to_png_bytes(self) -> bytes:
        qr = qrcode.QRCode(box_size=12, border=2)
        qr.add_data(self.value)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="#fff9db")

        buffer = BytesIO()
        img.save(buffer, format="PNG")
        return buffer.getvalue()
