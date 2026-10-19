"""A one-file Django shop that takes test payments through LocalPay.

Run:  LOCALPAY_URL=http://127.0.0.1:4010 python shop.py runserver 8000
The patterns are the same as the Express and FastAPI examples: server-side orders,
constant-time signature checks, raw-body webhook verification with event-id
de-duplication, and fulfilment only on payment.captured / order.paid.
"""
import hashlib
import hmac
import json
import os
import sys

import django
import razorpay
from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.urls import path
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

if not settings.configured:
    settings.configure(
        DEBUG=False,
        SECRET_KEY="example-only-not-secret",
        ROOT_URLCONF=__name__,
        ALLOWED_HOSTS=["127.0.0.1", "localhost"],
        MIDDLEWARE=[],
        INSTALLED_APPS=[],
    )
    django.setup()

KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "rzp_test_LocalPayDemo01")
KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "localpay_demo_secret")
WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "localpay_webhook_secret")
LOCALPAY_URL = os.environ.get("LOCALPAY_URL")

client = razorpay.Client(auth=(KEY_ID, KEY_SECRET), **({"base_url": LOCALPAY_URL} if LOCALPAY_URL else {}))
ORDERS: dict[str, dict] = {}
SEEN_EVENT_IDS: set[str] = set()


def sign(message: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@csrf_exempt
@require_POST
def create_order(request: HttpRequest) -> JsonResponse:
    order = client.order.create({"amount": 49900, "currency": "INR", "receipt": f"dj-{len(ORDERS) + 1}"})
    ORDERS[order["id"]] = {"status": "created", "events": []}
    return JsonResponse({"order_id": order["id"], "amount": order["amount"], "currency": order["currency"], "key": KEY_ID})


@csrf_exempt
@require_POST
def verify(request: HttpRequest) -> JsonResponse:
    body = json.loads(request.body or b"{}")
    order_id = body.get("razorpay_order_id", "")
    expected = sign(f"{order_id}|{body.get('razorpay_payment_id', '')}".encode(), KEY_SECRET)
    if not hmac.compare_digest(expected, str(body.get("razorpay_signature", ""))):
        return JsonResponse({"verified": False}, status=400)
    if ORDERS.get(order_id, {}).get("status") == "created":
        ORDERS[order_id]["status"] = "verified"
    return JsonResponse({"verified": True})


@csrf_exempt
@require_POST
def webhooks(request: HttpRequest) -> JsonResponse:
    raw = request.body  # verify the exact bytes before parsing
    if not hmac.compare_digest(sign(raw, WEBHOOK_SECRET), request.headers.get("X-Razorpay-Signature", "")):
        return JsonResponse({"error": "bad signature"}, status=400)
    event_id = request.headers.get("X-Razorpay-Event-Id")
    if event_id in SEEN_EVENT_IDS:
        return JsonResponse({"status": "duplicate ignored"})
    if event_id:
        SEEN_EVENT_IDS.add(event_id)
    event = json.loads(raw)
    payment = event.get("payload", {}).get("payment", {}).get("entity", {})
    order = ORDERS.get(payment.get("order_id", ""))
    if order is not None:
        order["events"].append(event["event"])
        if event["event"] in ("payment.captured", "order.paid"):
            order["status"] = "fulfilled"
        elif event["event"] == "payment.failed" and order["status"] != "fulfilled":
            order["status"] = "failed"
    return JsonResponse({"status": "ok"})


@require_GET
def order_status(request: HttpRequest, order_id: str) -> JsonResponse:
    if order_id not in ORDERS:
        return JsonResponse({"error": "unknown order"}, status=404)
    return JsonResponse(ORDERS[order_id])


urlpatterns = [
    path("api/orders", create_order),
    path("api/verify", verify),
    path("webhooks", webhooks),
    path("api/orders/<str:order_id>", order_status),
]

if __name__ == "__main__":
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)
