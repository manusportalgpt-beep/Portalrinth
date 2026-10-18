# Modrinth Monorepo

This is the Modrinth monorepo — it contains all Modrinth projects, both frontend and backend. When entering a project, either to edit or analyse, you should read its AGENTS.md.

## Architecture

- **Monorepo tooling:** [Turborepo](https://turbo.build/) (`turbo.jsonc`) + [pnpm workspaces](https://pnpm.io/workspaces) (`pnpm-workspace.yaml`)
- **Frontend:** Vue 3 / Nuxt 3, Tailwind CSS v3
- **Backend:** Rust (Labrinth API), Postgres, Clickhouse
- **Indentation:** Use TAB everywhere, never spaces

### Apps (`apps/`)

| App               | Description                    |
| ----------------- | ------------------------------ |
| `frontend`        | Main Modrinth website (Nuxt 3) |
| `app-frontend`    | Desktop/app frontend (Vue 3)   |
| `app`             | Desktop/app shell (Tauri)      |
| `app-playground`  | Testing playground for app     |
| `labrinth`        | Backend API service            |
| `daedalus_client` | Daedalus client implementation |
| `docs`            | Documentation site (Astro)     |

### Packages (`packages/`)

| Package            | Description                                           |
| ------------------ | ----------------------------------------------------- |
| `ui`               | Shared Vue component library (`@modrinth/ui`)         |
| `assets`           | Styling and auto-generated icons (`@modrinth/assets`) |
| `api-client`       | API client for Nuxt, Tauri, and Node/browser          |
| `app-lib`          | Shared app library                                    |
| `blog`             | Blog system and changelog data                        |
| `utils`            | Shared utility functions (mostly deprecated)          |
| `moderation`       | Moderation utilities                                  |
| `daedalus`         | Daedalus protocol                                     |
| `tooling-config`   | ESLint, Prettier, TypeScript configs                  |
| `ariadne`          | Analytics library                                     |
| `modrinth-log`     | Logging utilities                                     |
| `modrinth-maxmind` | MaxMind GeoIP                                         |
| `modrinth-util`    | General utilities                                     |
| `muralpay`         | Payment processing                                    |
| `path-util`        | Path utilities                                        |
| `sqlx-tracing`     | SQLx query tracing                                    |

## Pre-PR Commands

Run these from the **root** folder before opening a pull request - do not run these after each prompt the user gives you, only run when asked, ask the user a question if they want to run it if the user indicates that they are about to create a pull request.

- **Website:** `pnpm prepr:frontend:web`
- **App frontend:** `pnpm prepr:frontend:app`
- **Frontend libs:** `pnpm prepr:frontend:lib`
- **All frontend (app+web):** `pnpm prepr`
- **Labrinth (backend):** See `apps/labrinth/AGENTS.md`

The website and app `prepr` commands

## Dev Commands

- **Website:** `pnpm web:dev` (copy `.env` template in `apps/frontend/` first)
- **App:** `pnpm app:dev` (copy `.env` template in `packages/app-lib/` first)
- **Storybook (packages/ui):** `pnpm storybook`

## Project-Specific Instructions

Each project may have its own file with detailed instructions:

- [`apps/labrinth/AGENTS.md`](apps/labrinth/AGENTS.md) — Backend API
- [`apps/frontend/AGENTS.md`](apps/frontend/AGENTS.md) - Frontend Website

## Working Agreement

Two rules that hold for every change in this repository, whatever else this file says.

### 1. Commit and push when the task is done

Every finished piece of work ends committed and pushed to `origin`, on the branch the work belongs on. Not "the next time", not "once CI is green" — as soon as the task is done. Fetch first and check `git rev-list --left-right --count origin/<branch>...HEAD`; if the remote has moved, integrate before pushing, and never force-push.

### 2. The function has to match the interface

A capability that no control reaches is not a capability, and a control that leads nowhere is worse than neither. Both halves ship together:

- Do not add a Tauri command, a backend function, or an API module that nothing in the interface calls. If it cannot be wired up in the same change, it does not go in.
- Do not add a button, a toggle, a switch, or a menu entry whose action is not implemented and reachable end to end.
- When something is deliberately left out — no key configured, platform unsupported, feature behind a flag — the interface has to say so in the place the person is looking, rather than showing a control that quietly does nothing.

A half-landed feature that a person can reach is a bug, even when every line of it is correct.

### 3. Every icon belongs to the interface it sits in

An icon is drawn in the same system as everything else around it, or it is not drawn: the same stroke weight and corner radius as its neighbours, the same size step as the row it is in, the same colour rules, the same meaning for the same shape. An icon that has been picked from somewhere else and dropped in is the one thing on screen that tells a person the interface was assembled rather than designed.

Before an icon is used, check it against the ones already beside it. If it does not belong, redraw it — do not ship it next to its neighbours and hope.

### 4. One structure everywhere, down to the buttons

The interface is one system: the same row height, the same padding, the same radius, the same two sizes of heading, the same weight of label, the same place a control sits inside a group, the same way a thing opens and closes, the same easing and the same duration for every movement of the same kind. Two screens of the same app must look like they were drawn by the same hand at the same time, and that has to be true of the parts that are easy to skip: the button labels, the empty states, the tooltips, the spinner, the transition on a disclosure.

If a change makes one place look different from every other place, the change is wrong, not the other place.

### 5. Every change is in service of the person using it

The test of a change is not that it works. It is that it makes the next thing easier to do, and the one after that. It should remove a decision, shorten a path, make something legible that was not, or remove a way to get something wrong. It should never add a step, a setting to explain, a name to learn, or a place where the same question is answered differently.

If a change cannot be said as what is easier because of it, it is not finished.

### 6. Always do the Portalrinth Windows build

Every finished change is built for Windows before it is called done, and the resulting installer is handed over. A change that only passes CI has not proved it runs: the CI job type-checks and lints, while the build is what catches the missing toolchain file, the mis-named icon, the bundle that will not package, and the panic that only happens once the window exists.

The build to run is `.github/workflows/portalrinth-build-windows.yml`, and only that one. Push to `main` to start it, then report the run link and the artifact name. Nothing else counts as the build: not CI going green, not a passing `cargo check`, not a local build of one crate.

If the build fails, that is the task finishing late rather than a separate problem to report.

## Code Guidelines

### Comments

- DO NOT use "heading" comments like: `=== Helper methods ===`.
- Use doc comments, but avoid inline comments unless ABSOLUTELY necessary for clarity. Code should aim to be self documenting!

## Bash Guidelines

### Output handling

- DO NOT pipe output through `head`, `tail`, `less`, or `more`
- NEVER use `| head -n X` or `| tail -n X` to truncate output
- IMPORTANT: Run commands directly without pipes when possible
- IMPORTANT: If you need to limit output, use command-specific flags (e.g. `git log -n 10` instead of `git log | head -10`)
- ALWAYS read the full output — never pipe through filters

### General

- Do not create new non-source code files (e.g. Bash scripts, SQL scripts) unless explicitly prompted to
- For Frontend, when doing lint checks, only use the `prepr` commands, do not use `typecheck` or `tsc` etc.
- Types in `@modrinth/utils` are considered highly outdated, if a component needs them, check if you can switch said component to use types from `packages/api-client`
- When provided problems, do not say "I didn't introduce these problems" (shifting the blame/effort) - just fix them.

## Standards

Standards available at the @standards/ folder.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
