"""A tiny shop that takes test payments through LocalPay (or Razorpay test mode).

Patterns worth copying:
  1. create orders on the server;
  2. verify the checkout signature with hmac.compare_digest;
  3. verify webhooks over the raw body and de-duplicate by X-Razorpay-Event-Id;
  4. fulfil only on payment.captured / order.paid, never on payment.authorized.
"""
import hashlib
import hmac
import json
import os

import razorpay
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_LocalPayDemo01")
KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "localpay_demo_secret")
WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "localpay_webhook_secret")
LOCALPAY_URL = os.environ.get("LOCALPAY_URL")

# The one argument that switches the official SDK to LocalPay.
client = razorpay.Client(auth=(KEY_ID, KEY_SECRET), **({"base_url": LOCALPAY_URL} if LOCALPAY_URL else {}))

app = FastAPI(title="LocalPay FastAPI example")
orders: dict[str, dict] = {}
seen_event_ids: set[str] = set()


def sign(message: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@app.post("/api/orders")
def create_order() -> dict:
    order = client.order.create({"amount": 49900, "currency": "INR", "receipt": f"py-{len(orders) + 1}"})
    orders[order["id"]] = {"status": "created", "events": []}
    return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"], "key": KEY_ID}


class CheckoutResult(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@app.post("/api/verify")
def verify(result: CheckoutResult) -> dict:
    expected = sign(f"{result.razorpay_order_id}|{result.razorpay_payment_id}".encode(), KEY_SECRET)
    if not hmac.compare_digest(expected, result.razorpay_signature):
        raise HTTPException(status_code=400, detail={"verified": False})
    order = orders.get(result.razorpay_order_id)
    if order and order["status"] == "created":
        order["status"] = "verified"
    return {"verified": True}


@app.post("/webhooks")
async def webhooks(request: Request) -> dict:
    raw = await request.body()  # verify the exact bytes before parsing
    signature = request.headers.get("x-razorpay-signature", "")
    if not hmac.compare_digest(sign(raw, WEBHOOK_SECRET), signature):
        raise HTTPException(status_code=400, detail="bad signature")
    event_id = request.headers.get("x-razorpay-event-id")
    if event_id in seen_event_ids:
        return {"status": "duplicate ignored"}
    if event_id:
        seen_event_ids.add(event_id)

    event = json.loads(raw)
    payment = event.get("payload", {}).get("payment", {}).get("entity", {})
    order = orders.get(payment.get("order_id", ""))
    if order is not None:
        order["events"].append(event["event"])
        if event["event"] in ("payment.captured", "order.paid"):
            order["status"] = "fulfilled"
        elif event["event"] == "payment.failed" and order["status"] != "fulfilled":
            order["status"] = "failed"
    return {"status": "ok"}


@app.get("/api/orders/{order_id}")
def order_status(order_id: str) -> dict:
    if order_id not in orders:
        raise HTTPException(status_code=404, detail="unknown order")
    return orders[order_id]
