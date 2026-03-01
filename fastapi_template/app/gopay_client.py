import uuid
from typing import Any

import httpx

BASE_URL = "https://api.gobiz.co.id"


class GopayClient:
    def __init__(self):
        self.request_id = str(uuid.uuid4())

    def build_headers(self, kind: str, bearer: str | None = None) -> dict[str, str]:
        common = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
            "Authentication-Type": "go-id",
            "Authorization": f"Bearer {bearer}" if bearer else "Bearer",
            "Content-Type": "application/json",
            "Gojek-Country-Code": "ID",
            "Gojek-Timezone": "Asia/Jakarta",
            "User-Agent": "Mozilla/5.0",
            "X-AppVersion": "platform-v3.82.1",
            "X-PhoneMake": "Google",
            "X-PhoneModel": "Nexus 5",
            "X-Platform": "Web",
            "X-User-Locale": "id-ID",
            "X-User-Type": "merchant",
            "x-DeviceOS": "Web",
            "x-appId": "go-biz-web-dashboard",
            "x-uniqueid": self.request_id,
        }

        if kind == "token":
            common["Origin"] = "https://app.gobiz.com"
            common["Referer"] = "https://app.gobiz.com/"
        else:
            common["Origin"] = "https://portal.gofoodmerchant.co.id"
            common["Referer"] = "https://portal.gofoodmerchant.co.id/"

        if kind == "journals":
            common["Accept"] = "application/json, text/plain, */*, application/vnd.journal.v1+json"

        return common

    def get_tokens_by_password(self, email: str, password: str) -> dict[str, Any] | None:
        with httpx.Client(timeout=20) as c:
            login_res = c.post(
                f"{BASE_URL}/goid/login/request",
                headers=self.build_headers("login"),
                json={"email": email, "login_type": "password", "client_id": "go-biz-web-new"},
            )
            if login_res.status_code >= 400:
                return None

            token_res = c.post(
                f"{BASE_URL}/goid/token",
                headers=self.build_headers("token"),
                json={
                    "client_id": "go-biz-web-new",
                    "grant_type": "password",
                    "data": {"email": email, "password": password},
                },
            )
            if token_res.status_code >= 400:
                return None
            return token_res.json()

    def get_tokens_by_refresh(self, refresh_token: str) -> dict[str, Any] | None:
        with httpx.Client(timeout=20) as c:
            res = c.post(
                f"{BASE_URL}/goid/token",
                headers=self.build_headers("token"),
                json={
                    "client_id": "go-biz-web-new",
                    "grant_type": "refresh_token",
                    "data": {"refresh_token": refresh_token},
                },
            )
            if res.status_code >= 400:
                return None
            return res.json()

    def get_me(self, access_token: str) -> dict[str, Any] | None:
        with httpx.Client(timeout=20) as c:
            res = c.get(f"{BASE_URL}/v1/users/me", headers=self.build_headers("me", access_token))
            if res.status_code >= 400:
                return None
            return res.json()

    def search_journals(self, access_token: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with httpx.Client(timeout=20) as c:
            res = c.post(
                f"{BASE_URL}/journals/search",
                headers=self.build_headers("journals", access_token),
                json=payload,
            )
            if res.status_code >= 400:
                return None
            return res.json()
