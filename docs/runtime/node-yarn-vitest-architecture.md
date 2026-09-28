# Node.js + Yarn + Vitest Architecture

## Summary

The API keeps the existing Node.js runtime and Yarn package manager while
retaining Vitest as the only test runner. The runtime contract is:

- local dependency installs via `yarn.lock`
- local scripts via Yarn
- production startup via `node dist/main.js`
- container builds on `node:20-alpine`
- unit, e2e, and safety harness tests via Vitest

## Canonical Commands

```bash
yarn install --frozen-lockfile
yarn start:dev
yarn test
yarn build
```

## Build Boundary

`nest build` must not compile test-only files or nested git worktrees. The
guard lives in `tsconfig.build.json`:

- build types are restricted to `node`
- `test/`, `tests/`, and `worktrees/` are excluded
- `vitest.config.mts` is excluded from the production build

That boundary is what prevents local nested worktrees from leaking duplicate
entity classes into the Nest compile.

## Docker

The committed [`Dockerfile`](../../Dockerfile) is the source of truth for the
container runtime. It installs with Yarn and starts the app through the same
Node.js path the repo uses locally:

```bash
yarn build && yarn migration:run && yarn start:prod
```

## Runtime Integrity

The repo uses one supported test entrypoint:

```bash
yarn test
```

Any runtime integrity checks that remain in this repo should be covered by that
same Vitest run instead of a separate script family.
