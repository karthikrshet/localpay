# LocalPay

Test your Razorpay integration offline. No keys, no ngrok, every edge case one click away.

> **Status: Phase 0 (pre-alpha).** Nothing is usable yet. See [docs/PLAN.md](docs/PLAN.md) for the build plan.

LocalPay is a free, open-source server that behaves like the Razorpay API on your own
machine, so you can build and test payments with no account, no keys and no tunnels.

## What it is not

- Not a real payment gateway. It never moves money and never talks to a bank or NPCI.
- Not a production proxy. It refuses to run on a public network by default.
- Not a replacement for testing against Razorpay's real test mode before going live.
- Not a clone of Razorpay's dashboard or brand.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## Disclaimer

LocalPay is an independent open-source project. It is not affiliated with, endorsed by
or sponsored by Razorpay. "Razorpay" is used only to describe API compatibility.

## License

[Apache-2.0](LICENSE)
