---
name: release
description: Cut a LocalPay release - changesets, version, signed tag, npm publish with provenance, Docker push, announcement.
---
A maintainer runs releases. An agent may prepare the release PR but must not
publish, push tags or post announcements without the maintainer's explicit go-ahead.

1. Check main is green: lint, typecheck, unit, contract, SDK-compat and browser tests.
2. Check every user-visible change since the last release has a changeset;
   add missing ones.
3. Run `pnpm changeset version`; review CHANGELOG.md and version bumps
   (0.x may break, but say so in the changelog).
4. Check docs/compat.md and the docs site match what ships.
5. Open the release PR; get one maintainer review; merge.
6. Create a signed tag (git tag -s vX.Y.Z) and push it; release.yml publishes
   to npm with provenance from CI, never from a laptop.
7. Build and push the Docker image (distroless, non-root) with the same version tag.
8. Smoke test: `npx localpay@X.Y.Z` in a clean folder, then create and capture a
   test payment with the Node SDK in under 5 minutes.
9. Write the GitHub release notes from the changelog; post the announcement.
10. Update .claude/memory/progress.md.
