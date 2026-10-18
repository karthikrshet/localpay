# FastAPI example

The same shop as the Express example, in Python. `razorpay.Client` takes `base_url`, so
pointing it at LocalPay is one argument.

```bash
pip install -r requirements.txt
npx localpay --webhook http://127.0.0.1:8000/webhooks      # terminal 1
LOCALPAY_URL=http://127.0.0.1:4010 uvicorn app:app --port 8000   # terminal 2
```

Tests (they need a LocalPay on 127.0.0.1:4010 that sends webhooks to port 8011):

```bash
pip install -r requirements-dev.txt
npx localpay --webhook http://127.0.0.1:8011/webhooks &
pytest
```
