import time
from datetime import datetime, timezone
from typing import Any

from .config import settings
from .gopay_client import GopayClient
from .storage import JsonStateStore


class GopayGatewayService:
    def __init__(self):
        self.client = GopayClient()
        self.store = JsonStateStore(settings.gobiz_state_path)

    def _get(self, key: str):
        env_val = getattr(settings, key.lower(), None)
        return self.store.get(key) or env_val

    def _set(self, key: str, value: Any):
        self.store.set(key, value)

    def authenticate(self) -> str:
        access = self._get("GOBIZ_ACCESS_TOKEN")
        refresh = self._get("GOBIZ_REFRESH_TOKEN")

        if not access and not refresh:
            tokens = self._login_by_password_or_fail()
            access = tokens["access_token"]
            refresh = tokens["refresh_token"]
            self._persist_tokens(access, refresh)

        me = self.client.get_me(access)
        valid = bool(me) and (me.get("user", {}).get("expired") in (None, False))

        merchant_id = me.get("user", {}).get("merchant_id") if me else None
        if merchant_id:
            self._set("GOBIZ_MERCHANT_ID", merchant_id)

        if valid:
            return access

        if not refresh:
            raise RuntimeError("Gopay auth failed: no refresh token")

        refreshed = self.client.get_tokens_by_refresh(refresh)
        if not refreshed:
            refreshed = self._login_by_password_or_fail()

        self._persist_tokens(refreshed["access_token"], refreshed["refresh_token"])

        me_after = self.client.get_me(refreshed["access_token"])
        still_valid = bool(me_after) and (me_after.get("user", {}).get("expired") in (None, False))
        if not still_valid:
            raise RuntimeError("Gopay auth failed after refresh/password")

        merchant_id = me_after.get("user", {}).get("merchant_id")
        if merchant_id:
            self._set("GOBIZ_MERCHANT_ID", merchant_id)

        return refreshed["access_token"]

    def _login_by_password_or_fail(self) -> dict[str, Any]:
        email = self._get("GOBIZ_EMAIL")
        password = self._get("GOBIZ_PASSWORD")
        if not email or not password:
            raise RuntimeError("missing GOBIZ_EMAIL or GOBIZ_PASSWORD")

        tokens = self.client.get_tokens_by_password(email, password)
        if not tokens:
            raise RuntimeError("gobiz email/password incorrect")
        return tokens

    def _persist_tokens(self, access: str, refresh: str):
        self._set("GOBIZ_ACCESS_TOKEN", access)
        self._set("GOBIZ_REFRESH_TOKEN", refresh)

    def search_journals_relative(
        self,
        *,
        start_ms: int | None,
        end_ms: int | None,
        amount_eq: int | None = None,
        size: int = 50,
        from_: int = 0,
    ) -> dict[str, Any] | None:
        access = self.authenticate()
        now_ms = int(time.time() * 1000)
        end_ms = end_ms if end_ms is not None else now_ms

        merchant_id = self._get("GOBIZ_MERCHANT_ID")

        clauses: list[dict[str, Any]] = []
        if start_ms is not None:
            clauses.append(
                {
                    "field": "metadata.transaction.transaction_time",
                    "op": "gte",
                    "value": datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).isoformat(),
                }
            )
        if end_ms is not None:
            clauses.append(
                {
                    "field": "metadata.transaction.transaction_time",
                    "op": "lte",
                    "value": datetime.fromtimestamp(end_ms / 1000, tz=timezone.utc).isoformat(),
                }
            )

        clauses.append(
            {"field": "metadata.transaction.merchant_id", "op": "equal", "value": merchant_id}
        )

        if amount_eq is not None:
            clauses.append(
                {
                    "field": "metadata.transaction.gross_amount",
                    "op": "equal",
                    "value": int(round(float(amount_eq) * 100)),
                }
            )

        payload = {
            "from": from_,
            "size": size,
            "sort": {"time": {"order": "desc"}},
            "query": [{"clauses": clauses, "op": "and"}],
        }

        return self.client.search_journals(access, payload)

    def check_status(self, *, base_total_amount: int, created_at: int, expiry_at: int) -> dict[str, Any]:
        now_ms = int(time.time() * 1000)
        result = {"status": "pending", "amount": base_total_amount, "provider_ref": None}

        if now_ms > int(expiry_at):
            result["status"] = "expired"

        trxs = self.search_journals_relative(
            start_ms=int(created_at),
            end_ms=int(expiry_at),
            amount_eq=int(base_total_amount),
        )

        hits = (trxs or {}).get("hits") or []
        if hits:
            hit = hits[0]
            rrn = (
                (((hit.get("metadata") or {}).get("transaction") or {}).get("metadata") or {}).get(
                    "INTERNAL_CHALLENGE_ID"
                )
                or (((hit.get("metadata") or {}).get("provider_metadata") or {}).get("metadata") or {}).get(
                    "retrieval_reference_number"
                )
            )
            result["provider_ref"] = rrn
            result["status"] = "paid"

        return result


service = GopayGatewayService()
