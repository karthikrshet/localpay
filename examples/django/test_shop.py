"""End-to-end tests against a real LocalPay that sends webhooks to port 8012:
    npx localpay --webhook http://127.0.0.1:8012/webhooks
"""
import os
import threading
import time
from wsgiref.simple_server import WSGIRequestHandler, make_server

import httpx
import pytest

LOCALPAY_URL = os.environ.setdefault("LOCALPAY_URL", "http://127.0.0.1:4010")
APP_URL = "http://127.0.0.1:8012"

import shop  # noqa: E402  (imported after LOCALPAY_URL is set)
from django.core.wsgi import get_wsgi_application  # noqa: E402


class QuietHandler(WSGIRequestHandler):
    def log_message(self, *args):  # keep test output clean
        pass


@pytest.fixture(scope="session", autouse=True)
def server():
    httpd = make_server("127.0.0.1", 8012, get_wsgi_application(), handler_class=QuietHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield
    httpd.shutdown()


def buy(scenario: str):
    order = httpx.post(f"{APP_URL}/api/orders").json()
    result = httpx.post(f"{LOCALPAY_URL}/_localpay/checkout/pay", json={"key_id": order["key"], "order_id": order["order_id"], "method": "upi", "scenario": scenario}).json()
    return order, result


def wait_for(predicate, timeout=5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError("timed out waiting")


def status(order_id):
    return httpx.get(f"{APP_URL}/api/orders/{order_id}").json()


def test_pays_verifies_and_fulfils_on_capture_webhook():
    order, result = buy("success")
    assert httpx.post(f"{APP_URL}/api/verify", json=result).json() == {"verified": True}
    wait_for(lambda: status(order["order_id"])["status"] == "fulfilled")


def test_rejects_tampered_signatures_and_unsigned_webhooks():
    _, result = buy("success")
    assert httpx.post(f"{APP_URL}/api/verify", json={**result, "razorpay_signature": "0" * 64}).status_code == 400
    assert httpx.post(f"{APP_URL}/webhooks", content=b'{"event":"order.paid"}', headers={"content-type": "application/json"}).status_code == 400


def test_does_not_fulfil_authorized_only_payments():
    order, _ = buy("authorize_only")
    wait_for(lambda: status(order["order_id"])["events"] == ["payment.authorized"])
    assert status(order["order_id"])["status"] == "created"
