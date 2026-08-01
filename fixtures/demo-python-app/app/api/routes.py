"""Route handlers - depend on services, not models directly."""
from flask import Flask, jsonify, request

from app.lib.logger import info
from app.services.billing_service import charge_user
from app.services.order_service import list_orders, place_order
from app.services.user_service import get_user, list_users


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/users")
    def users():
        return jsonify([u.to_dict() for u in list_users()])

    @app.get("/users/<user_id>")
    def user_detail(user_id: str):
        user = get_user(user_id)
        if user is None:
            return jsonify({"error": "not_found"}), 404
        return jsonify(user.to_dict())

    @app.post("/orders")
    def create_order():
        body = request.get_json(silent=True) or {}
        order = place_order(
            user_id=str(body.get("user_id", "")),
            sku=str(body.get("sku", "sku-1")),
            qty=int(body.get("qty", 1)),
        )
        info("order placed", order_id=order.id)
        return jsonify(order.to_dict()), 201

    @app.get("/orders")
    def orders():
        return jsonify([o.to_dict() for o in list_orders()])

    @app.post("/billing/charge")
    def billing_charge():
        body = request.get_json(silent=True) or {}
        result = charge_user(
            user_id=str(body.get("user_id", "")),
            amount_cents=int(body.get("amount_cents", 0)),
        )
        return jsonify(result)

    return app
