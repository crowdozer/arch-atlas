"""Formatting helpers."""


def money_cents(cents: int) -> str:
    return f"${cents / 100:.2f}"


def slug(s: str) -> str:
    return "-".join(s.strip().lower().split())
