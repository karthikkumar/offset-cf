from datetime import datetime, timezone
from typing import Optional


def month_bounds(month_str: Optional[str]) -> tuple[datetime, datetime]:
    """Calculate start and end datetime bounds for a given month string.

    Args:
        month_str: "YYYY-MM" format or None (defaults to current UTC month)

    Returns:
        Tuple of (start_datetime, end_datetime) for the month
    """
    now = datetime.now(timezone.utc)
    if month_str:
        y, m = map(int, month_str.split("-", 1))
        start = datetime(y, m, 1, tzinfo=timezone.utc)
    else:
        start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)

    # first day of next month
    end = datetime(start.year + (start.month // 12),
                   1 if start.month == 12 else start.month + 1,
                   1, tzinfo=timezone.utc)
    return start, end
