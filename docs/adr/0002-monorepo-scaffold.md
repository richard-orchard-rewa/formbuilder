# ADR-0002: Scaffold as a standalone npm-workspaces monorepo

## Status

Accepted

## Context

form-builder needs a project layout before feature work (US-1.x onward) can
start. The organisation already runs one app, `feedback`, as an npm
workspaces monorepo (`client/`, `server/`, `shared/`) with Fastify on the
server, one plugin per capability, and Drizzle-backed Postgres.

form-builder is a separate product with its own repo and its own lifecycle.

## Decision

Scaffold form-builder as its **own** npm-workspaces monorepo, following the
same `client/` / `server/` / `shared/` layout and the same
plugin-per-capability Fastify pattern as `feedback`, for consistency and so
prior experience transfers directly. This is imitation of the pattern, not
integration: form-builder does not depend on the `feedback` repo, does not
share a database, and no changes are made to `feedback`.

## Consequences

- `server/src/modules/<capability>/` holds one Fastify plugin per capability
  (routes → service → repository), starting with `form-builder` in this
  change.
- `shared/` carries Zod schemas consumed by both `client` and `server`.
- Future features add new modules under `server/src/modules/`, not a new
  top-level workspace, unless a concrete need justifies one.
