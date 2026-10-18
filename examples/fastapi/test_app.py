"""End-to-end tests against a real LocalPay.

Needs LocalPay on LOCALPAY_URL (default http://127.0.0.1:4010) delivering webhooks to
http://127.0.0.1:8011/webhooks:  npx localpay --webhook http://127.0.0.1:8011/webhooks
"""
import os
import threading
import time

import httpx
import pytest
import uvicorn

LOCALPAY_URL = os.environ.setdefault("LOCALPAY_URL", "http://127.0.0.1:4010")
APP_URL = "http://127.0.0.1:8011"

from app import app  # noqa: E402  (imported after LOCALPAY_URL is set)


@pytest.fixture(scope="session", autouse=True)
def server():
    config = uvicorn.Config(app, host="127.0.0.1", port=8011, log_level="warning")
    instance = uvicorn.Server(config)
    thread = threading.Thread(target=instance.run, daemon=True)
    thread.start()
    for _ in range(50):
        if instance.started:
            break
        time.sleep(0.1)
    yield
    instance.should_exit = True
    thread.join(timeout=5)


def buy(scenario: str) -> tuple[dict, dict]:
    order = httpx.post(f"{APP_URL}/api/orders").json()
    result = httpx.post(
        f"{LOCALPAY_URL}/_localpay/checkout/pay",
        json={"key_id": order["key"], "order_id": order["order_id"], "method": "upi", "scenario": scenario},
    ).json()
    return order, result


def wait_for(predicate, timeout: float = 5.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.05)
    raise AssertionError("timed out waiting")


def status(order_id: str) -> dict:
    return httpx.get(f"{APP_URL}/api/orders/{order_id}").json()


def test_pays_verifies_and_fulfils_on_capture_webhook():
    order, result = buy("success")
    assert httpx.post(f"{APP_URL}/api/verify", json=result).json() == {"verified": True}
    wait_for(lambda: status(order["order_id"])["status"] == "fulfilled")
    assert status(order["order_id"])["events"] == ["payment.authorized", "payment.captured", "order.paid"]


def test_rejects_a_tampered_signature():
    _, result = buy("success")
    response = httpx.post(f"{APP_URL}/api/verify", json={**result, "razorpay_signature": "0" * 64})
    assert response.status_code == 400


def test_does_not_fulfil_authorized_only_payments():
    order, _ = buy("authorize_only")
    wait_for(lambda: status(order["order_id"])["events"] == ["payment.authorized"])
    assert status(order["order_id"])["status"] == "created"


def test_records_failures():
    order, result = buy("bank_down")
    assert result["error"]["reason"] == "bank_technical_error"
    wait_for(lambda: status(order["order_id"])["status"] == "failed")
