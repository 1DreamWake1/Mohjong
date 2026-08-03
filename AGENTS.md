# Repository Guidelines

## Project Structure & Module Organization

This repository is a pnpm workspace for an online Mahjong system.

- `Documents/README.md` is the documentation index and should stay in sync when documents are added or renamed.
- `Documents/requirements.md` defines product scope and acceptance criteria.
- `Documents/architecture-design.md` describes the current architecture and technology choices.
- `Documents/development-plan.md` tracks implementation phases.
- `Documents/deployment.md` is the Docker Compose deployment and operations guide.

The implementation uses `apps/web`, `apps/server`, `packages/mahjong-core`, `packages/shared`, and `prisma/`. Keep Mahjong rules framework-independent inside `packages/mahjong-core`.

## Build, Test, and Development Commands

```bash
pnpm install                  # install workspace dependencies
pnpm typecheck                # run TypeScript checks across packages
pnpm lint                     # run linting
pnpm test                     # run all tests
pnpm build                    # build production artifacts
pnpm -F mahjong-core test  # run core rules tests only
pnpm dev                      # start web and server dev processes
docker compose up -d --build  # start the production-style stack
```

## Coding Style & Naming Conventions

Code uses TypeScript in strict mode. Prefer small typed modules and explicit exported types for cross-package contracts.

Use camelCase for variables/functions, PascalCase for React components and TypeScript types, and kebab-case for package or directory names. Planned formatting tools are ESLint and Prettier.

## Testing Guidelines

The test framework is Vitest. Test core rules before server or UI integration. Prioritize tile modeling, wall generation, legal actions, reducer behavior, scoring, visibility filtering, and bot simulations.

Use clear test names that describe behavior, for example `rejects illegal discard` or `runs four bot players to completion`.

## Commit & Pull Request Guidelines

Existing commits use short Chinese messages with an action-oriented summary, for example `增加文档` and `完善设计文档与 AGENTS.md`. Continue this style unless the team adopts a stricter convention.

Pull requests should include a concise description, affected documents or modules, verification performed, and screenshots for UI changes. Link related issues or planning sections when applicable.

## Agent-Specific Instructions

Treat code and tests as the source of truth for implemented behavior. Keep documentation current, update the index when adding or renaming files, and avoid details that conflict with the implementation.

Do not manually edit generated artifacts such as `pnpm-lock.yaml`, `dist/`, `node_modules/`, SQLite database files, or journal files once they exist.
