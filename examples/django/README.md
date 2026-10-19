# Django example

A one-file Django shop (`shop.py`) that takes test payments through LocalPay. The
official Python SDK takes `base_url`, so switching to LocalPay is one argument.

```bash
pip install -r requirements.txt
npx localpay --webhook http://127.0.0.1:8000/webhooks                  # terminal 1
LOCALPAY_URL=http://127.0.0.1:4010 python shop.py runserver 8000         # terminal 2
```

Tests need LocalPay on 127.0.0.1:4010 delivering webhooks to port 8012:

```bash
pip install -r requirements-dev.txt
npx localpay --webhook http://127.0.0.1:8012/webhooks &
pytest
```
