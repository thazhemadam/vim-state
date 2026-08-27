# vim-state

[![CI](https://github.com/thazhemadam/vim-state/actions/workflows/ci.yml/badge.svg)](https://github.com/thazhemadam/vim-state/actions/workflows/ci.yml)
[![vim-state on npm](https://img.shields.io/npm/v/%40thazhemadam%2Fvim-state?label=vim-state)](https://www.npmjs.com/package/@thazhemadam/vim-state)
[![pi-vim on npm](https://img.shields.io/npm/v/%40thazhemadam%2Fpi-vim?label=pi-vim)](https://www.npmjs.com/package/@thazhemadam/pi-vim)
[![License: LGPL-3.0-only](https://img.shields.io/badge/license-LGPL--3.0--only-blue.svg)](LICENSE)

A monorepo for a host-neutral Vim state machine and its editor integrations.

The core package models modal state, motions, operators, selections, registers, and editing semantics. Integrations connect that model to specific editor hosts.

## Packages

| Package                                               | Description                                                                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`@thazhemadam/vim-state`](packages/vim-state)        | The host-neutral state machine, editor contracts, editing operations, selectors, and history primitives. |
| [`@thazhemadam/pi-vim`](packages/integrations/pi-vim) | A Pi adapter that connects the state machine to the Pi prompt editor.                                    |

## Design

The monorepo separates Vim semantics from host behavior:

```text
host input
    │
    ▼
integration adapter ── normalizes input and manages host behavior
    │
    ▼
vimMachine ─────────── parses modal state and selects operations
    │
    ▼
VimEditorApi ───────── defines semantic editor operations
    │
    ▼
host editor
```

`@thazhemadam/vim-state` does not depend on a terminal, user interface framework, or host application. It accepts normalized key events and calls a semantic editor API.

An integration owns host-specific concerns. These concerns can include input decoding, rendering, clipboard access, autocomplete, prompt history, and native shortcuts.

Hosts can integrate at either of these levels:

1. Implement `VimEditorApi` with native semantic operations.
2. Implement the smaller `VimEditorHost` contract and use the `VimEditor()` mixin.

The mixin translates semantic operations into cursor, line, and raw-input primitives.

## Repository structure

```text
.
├── packages/
│   ├── vim-state/                 Host-neutral Vim state and semantics
│   └── integrations/
│       └── pi-vim/                Pi host integration
├── scripts/
│   └── checks/                    Package and Pi compatibility checks
├── docs/
│   └── releasing.md               Maintainer release process
├── .changeset/                    Release notes and Changesets settings
├── .github/workflows/             Validation and release automation
├── CONTRIBUTING.md                Contributor workflow
└── package.json                   npm workspaces and root commands
```

## Package boundaries

### Core state and semantics

Changes belong in `packages/vim-state` when they describe host-neutral Vim behavior. Examples include:

- Modal transitions
- Counts and operator parsing
- Motions and text objects
- Register types
- Visual selection state
- Semantic editor operations
- Reusable history primitives

The core package must not depend on Pi or another host framework.

### Host integrations

Changes belong under `packages/integrations` when they adapt the core to a specific editor. Examples include:

- Terminal input normalization
- Host editor composition
- Mode rendering
- Clipboard bridges
- Host shortcut handling
- Compatibility work for a host API

An integration can expose additional behavior without adding that behavior to the core package.

## Development

Use Node.js 24 and npm 11, the versions used by the main CI job.

```bash
git clone https://github.com/thazhemadam/vim-state.git
cd vim-state
npm ci
npm run check
npm test
```

Useful commands:

| Command                  | Action                                      |
| ------------------------ | ------------------------------------------- |
| `npm run build`          | Build all packages.                         |
| `npm run check`          | Run TypeScript checks and Oxlint.           |
| `npm test`               | Run all package tests.                      |
| `npm run check:packages` | Verify npm tarballs and Pi package loading. |
| `npm run format`         | Format the repository with Prettier.        |
| `npm run clean`          | Delete generated package output.            |

Integration-specific development commands belong in each integration README. For example, the [pi-vim README](packages/integrations/pi-vim/README.md#local-development) documents its local host launcher.

## Contributing and releases

Read [CONTRIBUTING.md](CONTRIBUTING.md) for package boundaries, tests, Changesets, and pull request requirements.

Maintainers can read [docs/releasing.md](docs/releasing.md) for the automated versioning and publishing workflow.

## License

This project uses the [GNU Lesser General Public License v3.0 only](LICENSE). The repository also includes the corresponding [GNU GPL v3 text](LICENSE.GPL).
