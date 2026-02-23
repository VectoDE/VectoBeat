def ms_to_clock(ms: int) -> str:
    """Convert milliseconds into a human readable duration string."""
    seconds = max(0, int(ms // 1000))
    minutes, secs = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:d}:{secs:02d}"
