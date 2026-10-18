# syntax=docker/dockerfile:1
# LocalPay image: distroless, non-root, works with a read-only root filesystem.
#   docker build -f docker/Dockerfile -t localpay .
#   docker run --rm --read-only -p 127.0.0.1:4010:4010 localpay
# Always publish the port on 127.0.0.1 so LocalPay is not reachable from other machines.

FROM node:22-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm build \
 && pnpm --filter localpay pack --pack-destination /out

FROM node:22-bookworm-slim AS install
WORKDIR /app
COPY --from=build /out/ /tmp/pkg/
RUN echo '{"name":"localpay-image","private":true}' > package.json \
 && npm install --omit=dev --no-audit --no-fund /tmp/pkg/*.tgz

FROM gcr.io/distroless/nodejs22-debian12:nonroot
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
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
ENTRYPOINT ["/nodejs/bin/node", "node_modules/localpay/dist/localpay.js"]
CMD ["start"]
