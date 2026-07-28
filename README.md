# pi-vim

A Pi extension for Vim-style modal editing, backed by the reusable `vim-state` package.

The reusable Vim engine is published from `packages/vim-state/`, with a Pi `CustomEditor` integration layered on top.

## Approach

pi-vim implements modal editing as an XState-backed extended finite-state machine:

```text
raw host input -> VimEvent -> XState actor -> typed editor method
```

- The reusable **Vim core** lives under `packages/vim-state/` and does not import Pi.
- The reusable **Vim editor mixin** implements `VimEditorApi` over any `VimEditorHost`.
- The **Pi integration** lives under `packages/integrations/pi-vim/src/`, provides a Pi `VimEditorHost`, and installs a custom editor component.
- Mode transitions will be validated against headless Neovim where practical.
- Kenny Pete's “Navigating the modes of Vim” diagram is used only as a reference/coverage checklist.
- Normal `u` and `<C-r>` use `vim-state`'s linear history policy to restore Pi text/cursor snapshots and clear redo after new text edits.

See [docs/approach.md](docs/approach.md) for the full strategy and source citations, and [docs/roadmap.md](docs/roadmap.md) for the incremental implementation plan.

## Project layout

```text
packages/
  vim-state/                 Reusable Vim state and editor semantics
  integrations/
    pi-vim/                  Pi CustomEditor integration

docs/
  approach.md                Implementation strategy, validation plan, references
  roadmap.md                 Incremental build plan and cursor-position policy
```

## Usage during development

Install dependencies:

```bash
npm install
```

Run type checks:

```bash
npm run check
```

Load as a temporary Pi package while developing:

```bash
pi -e .
```

Then run:

```text
/vim-pi-status
```

The command should report that the Vim editor loaded.

## Pi package manifest

`packages/integrations/pi-vim/package.json` owns the canonical Pi manifest. The private root manifest forwards local loading to the integration:

```json
{
  "pi": {
    "extensions": ["./packages/integrations/pi-vim/dist/index.js"]
  }
}
```

Pi can load the compiled integration from the repository root with `pi -e .` after dependencies are installed.

## Status

- [x] npm package scaffold
- [x] documented implementation approach
- [x] extracted `vim-state` package boundary
- [x] incremental roadmap with explicit cursor-position rules
- [x] XState core / adapter architecture plan
- [x] XState core shell (`insert`/`normal`, `escape`/`i`)
- [x] Pi custom editor adapter
- [ ] Neovim validation harness
- [x] editing semantic tests

## References

Primary references are collected in [docs/approach.md](docs/approach.md#references).
