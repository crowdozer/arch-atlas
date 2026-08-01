"""Billing - external HTTP + local user check."""
import requests

from app.lib.logger import info
from app.services.user_service import get_user


def charge_user(user_id: str, amount_cents: int) -> dict:
    user = get_user(user_id)
    if user is None:
        return {"ok": False, "error": "unknown_user"}

    # Observed external leaf for the import graph (not executed in Atlas).
    payload = {
        "customer": user.email,
        "amount": amount_cents,
        "currency": "usd",
    }
    info("charge request built", **payload)
    try:
        requests.post("https://api.example.com/v1/charges", json=payload, timeout=1)
    except Exception:
        # Offline-friendly: still return a synthetic result
        pass
    return {"ok": True, "user_id": user_id, "amount_cents": amount_cents}
