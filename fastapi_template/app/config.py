from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gobiz_email: str | None = None
    gobiz_password: str | None = None
    gobiz_access_token: str | None = None
    gobiz_refresh_token: str | None = None
    gobiz_merchant_id: str | None = None
    gobiz_state_path: str = "./gopay_state.json"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
