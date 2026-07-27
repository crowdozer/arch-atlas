"""Orders — uses users + shared format helpers."""
from app.db.session import get_session
from app.lib.format import money_cents
from app.lib.logger import warn
from app.models.order import Order
from app.services.user_service import get_user

_orders: list[Order] = []
_seq = 0


def place_order(user_id: str, sku: str, qty: int) -> Order:
    global _seq
    user = get_user(user_id)
    if user is None:
        warn("order for unknown user", user_id=user_id)
    _seq += 1
    order = Order(
        id=f"ord-{_seq}",
        user_id=user_id,
        sku=sku,
        qty=max(1, qty),
        total_cents=max(1, qty) * 999,
    )
    _orders.append(order)
    return order


def list_orders() -> list[Order]:
    # Open (and drop) a session so the db leaf stays wired in real code paths.
    session = get_session()
    session.close()
    return list(_orders)


def order_total_label(order: Order) -> str:
    return money_cents(order.total_cents)
