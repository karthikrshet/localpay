# syntax=docker/dockerfile:1
# LocalPay image: distroless, non-root, works with a read-only root filesystem.
#   docker build -f docker/Dockerfile -t localpay .
#   docker run --rm --read-only -p 127.0.0.1:4010:4010 localpay
# Always publish the port on 127.0.0.1 so LocalPay is not reachable from other machines.

# Base images are pinned by digest; Renovate keeps the digests current.
FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS build
WORKDIR /src
RUN corepack enable
COPY . .
# Production dependencies come from the frozen pnpm lockfile, not a fresh npm resolve.
RUN pnpm install --frozen-lockfile \
 && pnpm build \
 && pnpm --filter localpay deploy --prod --legacy /out/app

FROM gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e
WORKDIR /app
COPY --from=build /out/app/package.json ./
COPY --from=build /out/app/dist ./dist
COPY --from=build /out/app/node_modules ./node_modules
# Inside the container LocalPay must listen on all interfaces. The CLI then requires a
# dashboard password: set LOCALPAY_DASHBOARD_PASSWORD, or one is generated and printed.
ENV LOCALPAY_HOST=0.0.0.0 \
    LOCALPAY_ALLOW_PUBLIC=1 \
    LOCALPAY_HOME=/tmp \
    NO_COLOR=1
EXPOSE 4010
USER nonroot
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:4010/_localpay/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node", "dist/localpay.js"]
CMD ["start"]
