/** @type {import('next').NextConfig} */
export default {
  // The shim ships TypeScript in this repo; Next compiles it.
  transpilePackages: ['@localpay/shim-node'],
};
