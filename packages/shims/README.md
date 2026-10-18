# @localpay/shim-node

Points the official Razorpay Node SDK at a local [LocalPay](https://github.com/localpay/localpay)
server. The SDK has no host option, so this sets the base URL on its HTTP client and turns
"server not running" into a readable error.

```js
import Razorpay from 'razorpay';
import { pointAtLocalPay } from '@localpay/shim-node';

const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
if (process.env.LOCALPAY_URL) pointAtLocalPay(razorpay, process.env.LOCALPAY_URL);
```

`createLocalPayClient(Razorpay, { baseUrl, key_id, key_secret })` builds a pointed client in
one call, defaulting to `$LOCALPAY_URL` and LocalPay's demo key.

Independent project, not affiliated with or endorsed by Razorpay. Tested with razorpay 2.9.8.
