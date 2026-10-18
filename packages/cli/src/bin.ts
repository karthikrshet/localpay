#!/usr/bin/env node
// The `localpay` executable.
import { main } from './cli.ts';

const result = await main(process.argv.slice(2), {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  env: process.env,
  cwd: process.cwd(),
  color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR,
});

if (result.stop) {
  const shutdown = () => {
    void result.stop?.().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} else {
  process.exitCode = result.code;
}
