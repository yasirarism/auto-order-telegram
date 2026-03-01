from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .gateway_service import service

app = FastAPI(title="GoPay Merchant Gateway Template", version="1.0.0")


class CheckStatusRequest(BaseModel):
    base_total_amount: int
    created_at: int
    expiry_at: int


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/gopay/auth/refresh")
def auth_refresh():
    try:
        access_token = service.authenticate()
        return {"ok": True, "access_token": access_token}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@app.post("/gopay/check-status")
def check_status(payload: CheckStatusRequest):
    try:
        return service.check_status(
            base_total_amount=payload.base_total_amount,
            created_at=payload.created_at,
            expiry_at=payload.expiry_at,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
