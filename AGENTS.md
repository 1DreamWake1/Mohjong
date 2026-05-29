# Repository Guidelines

## Project Structure & Module Organization

This repository is currently in the documentation and planning stage for an online Mahjong system.

- `Documents/README.md` is the documentation index and should stay in sync when documents are added or renamed.
- `Documents/requirements.md` defines product scope and acceptance criteria.
- `Documents/architecture-design.md` and `Documents/technical-architecture.md` describe the planned architecture and technology choices.
- `Documents/development-plan.md` tracks implementation phases.

The planned implementation is a pnpm workspace with `apps/web`, `apps/server`, `packages/mahjong-core`, `packages/shared`, and `prisma/`. Treat these as planned paths until phase 0 is committed.

## Build, Test, and Development Commands

There are no runnable build or test commands yet because the code scaffold does not exist.

After phase 0, the expected commands are:

```bash
pnpm install          # install workspace dependencies
pnpm typecheck        # run TypeScript checks across packages
pnpm lint             # run linting
pnpm test             # run all tests
pnpm -F mahjong-core test  # run core rules tests only
pnpm dev              # start web and server dev processes
```

When adding the scaffold, make sure these scripts exist in `package.json`.

## Coding Style & Naming Conventions

Planned code uses TypeScript in strict mode. Prefer small typed modules and explicit exported types for cross-package contracts. Keep Mahjong rules framework-independent inside `packages/mahjong-core`.

Use camelCase for variables/functions, PascalCase for React components and TypeScript types, and kebab-case for package or directory names. Planned formatting tools are ESLint and Prettier.

## Testing Guidelines

The planned test framework is Vitest. Test core rules before server or UI integration. Prioritize tile modeling, wall generation, legal actions, reducer behavior, scoring, visibility filtering, and bot simulations.

Use clear test names that describe behavior, for example `rejects illegal discard` or `runs four bot players to completion`.

## Commit & Pull Request Guidelines

Existing commits use short Chinese messages with an action-oriented summary, for example `增加文档` and `完善设计文档与 AGENTS.md`. Continue this style unless the team adopts a stricter convention.

Pull requests should include a concise description, affected documents or modules, verification performed, and screenshots for UI changes. Link related issues or planning sections when applicable.

## Agent-Specific Instructions

Treat `Documents/` as the source of truth until code exists. Keep documentation changes narrow, update the index when adding files, and avoid details that conflict with the requirements or plan.

Do not manually edit generated artifacts such as `pnpm-lock.yaml`, `dist/`, `node_modules/`, SQLite database files, or journal files once they exist.
