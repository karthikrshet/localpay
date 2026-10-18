"""Phase 0 spike: point the official razorpay Python SDK at a local server.

Usage: python create_order.py http://127.0.0.1:4010
Prints the created order as JSON on stdout.
"""
import json
import sys

import razorpay

host = sys.argv[1]
# The SDK accepts base_url as a constructor option. Host only: paths already start with /v1.
client = razorpay.Client(auth=("rzp_test_spike", "spike_secret"), base_url=host)
order = client.order.create({"amount": 50000, "currency": "INR", "receipt": "spike-py", "notes": {"purpose": "phase-0"}})
print(json.dumps(order))
