import json
import time
from pathlib import Path
from typing import Optional


def _default_store_path() -> Path:
    # Persist under bot/data so Docker volume/bind mounts keep the history across restarts.
    base = Path(__file__).resolve().parents[1] / "data"
    return base / "uptime.json"


class HealthState:
    started_at = time.time()
    first_seen = started_at
    accumulated_uptime = 0.0
    store_path: Path = _default_store_path()

    @classmethod
    def load(cls, path: Optional[str] = None) -> None:
        """Load persisted uptime data if available."""
        if path:
            cls.store_path = Path(path)
        try:
            if cls.store_path.exists():
                data = json.loads(cls.store_path.read_text())
                cls.first_seen = float(data.get("first_seen", cls.started_at))
                cls.accumulated_uptime = float(data.get("accumulated_uptime", 0.0))
        except Exception:
            cls.first_seen = cls.started_at
            cls.accumulated_uptime = 0.0
        # Ensure we immediately persist a baseline so future restarts retain the earliest timestamp.
        cls.persist()

    @classmethod
    def persist(cls) -> None:
        """Persist cumulative uptime to disk."""
        total = cls.accumulated_uptime + (time.time() - cls.started_at)
        cls.store_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "first_seen": cls.first_seen,
            "accumulated_uptime": total,
            "updated_at": time.time(),
        }
        try:
            cls.store_path.write_text(json.dumps(payload))
        except Exception:
            pass

    @classmethod
    async def persist_async(cls) -> None:
        cls.persist()

    @classmethod
    def uptime(cls) -> float:
        return cls.accumulated_uptime + (time.time() - cls.started_at)

    @classmethod
    def uptime_percent(cls) -> float:
        lifetime = max(time.time() - cls.first_seen, 1.0)
        percent = (cls.uptime() / lifetime) * 100
        return max(0.0, min(100.0, percent))


# Load persisted uptime when the module is imported.
HealthState.load()
