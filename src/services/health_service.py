import time


class HealthState:
    started_at = time.time()

    @classmethod
    def uptime(cls) -> float:
        return time.time() - cls.started_at
