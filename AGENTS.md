# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains planning documents for an online Mahjong project.

- `Documents/README.md` is the documentation index.
- `Documents/requirements.md` defines product requirements.
- `Documents/architecture-design.md` defines system architecture.
- `Documents/technical-architecture.md` defines technology choices.
- `Documents/development-plan.md` defines phased delivery.

Planned implementation structure:

- `apps/web/` for the React browser client.
- `apps/server/` for the Node.js server.
- `packages/mahjong-core/` for rules, game state, and bot algorithms.
- `packages/shared/` for API and socket event types.
- `prisma/` for database schema and migrations.

## Build, Test, and Development Commands

No buildable application has been scaffolded yet. For now, validate documentation changes with:

- `find Documents -maxdepth 1 -type f` to inspect document files.
- `git diff -- Documents AGENTS.md` to review documentation edits.

Once the TypeScript workspace is added, prefer these commands:

- `pnpm install` to install dependencies.
- `pnpm dev` to run local web and server apps.
- `pnpm test` to run unit tests.
- `pnpm lint` to run lint checks.
- `pnpm build` to build all packages.

## Coding Style & Naming Conventions

Use Markdown for documentation with clear headings and concise sections. Keep filenames lowercase with hyphens, for example `architecture-design.md`.

For future TypeScript code, use 2-space indentation, `camelCase` for variables and functions, `PascalCase` for React components and types, and `kebab-case` for route-like filenames only when the local framework convention prefers it.

## Testing Guidelines

The first test priority is `packages/mahjong-core/`. Add focused unit tests for tile modeling, dealing, legal actions, win detection, scoring, rule configuration, and bot decisions.

Use test filenames such as `rule-engine.test.ts` or `basic-bot.test.ts`. Core rule tests should be deterministic by accepting a seeded or fixed tile wall where needed.

## Commit & Pull Request Guidelines

Current git history uses short Chinese commit messages, for example `增加文档`. Continue using concise, imperative commit messages in Chinese or English, such as `补充架构设计` or `Add mahjong core tests`.

Pull requests should include:

- A short summary of the change.
- Links to related requirements or development-plan sections.
- Test results or a note when tests are not applicable.
- Screenshots for UI changes.

## Architecture Notes

Keep Mahjong rules independent from UI, database, and socket code. The server must validate all game actions and send each player only their permitted view of game state.
