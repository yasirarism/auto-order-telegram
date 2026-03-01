import json
from pathlib import Path
from threading import Lock
from typing import Any


class TransactionStore:
    def __init__(self, path: str = "./transactions.sample.json"):
        self.path = Path(path)
        self._lock = Lock()

    def _read(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _write(self, rows: list[dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)

    def add(self, row: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            rows = self._read()
            row["id"] = (max([r.get("id", 0) for r in rows], default=0) + 1)
            rows.append(row)
            self._write(rows)
            return row

    def list_pending(self) -> list[dict[str, Any]]:
        with self._lock:
            return [r for r in self._read() if r.get("status") == "pending"]

    def update(self, row_id: int, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            rows = self._read()
            for i, row in enumerate(rows):
                if int(row.get("id", -1)) == int(row_id):
                    rows[i] = {**row, **patch}
                    self._write(rows)
                    return rows[i]
            return None
