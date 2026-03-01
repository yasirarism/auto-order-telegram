import json
from pathlib import Path
from threading import Lock


class JsonStateStore:
    def __init__(self, path: str):
        self.path = Path(path)
        self._lock = Lock()

    def _read_all(self) -> dict:
        if not self.path.exists():
            return {}
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _write_all(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get(self, key: str):
        with self._lock:
            return self._read_all().get(key)

    def set(self, key: str, value):
        with self._lock:
            data = self._read_all()
            data[key] = value
            self._write_all(data)
