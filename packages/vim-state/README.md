# @thazhemadam/vim-state

[![npm](https://img.shields.io/npm/v/%40thazhemadam%2Fvim-state)](https://www.npmjs.com/package/@thazhemadam/vim-state)
[![License: LGPL-3.0-only](https://img.shields.io/badge/license-LGPL--3.0--only-blue.svg)](LICENSE)

A reusable Vim modal state machine with host-neutral editing operations.

`vim-state` provides the parser state, motions, operators, selections, registers, and history primitives used by [`@thazhemadam/pi-vim`](https://www.npmjs.com/package/@thazhemadam/pi-vim). The package has no dependency on Pi or a user interface framework.

This package implements a Vim subset for editor adapters that need modal behavior without embedding Vim.

## Install

```bash
npm install @thazhemadam/vim-state
```

## Architecture

The package separates parsing from host mutation:

```text
host key event
    │
    ▼
vimMachine ── calls VimEditorApi
                    ├── native implementation ───────── host editor
                    └── VimEditor() mixin ── VimEditorHost ── host editor
```

Use one of two integration levels:

1. Implement `VimEditorApi` when your host already provides semantic editing operations.
2. Implement `VimEditorHost` and use the `VimEditor()` mixin when your host only provides editor primitives.

The second option reuses the motion and operator implementations in this package.

## Integrate with the host mixin

Implement the primitive host contract:

```ts
import {
  VimEditor,
  type VimEditorHost,
  type VimPosition,
} from "@thazhemadam/vim-state";

class TextEditorHost implements VimEditorHost {
  getCursor(): VimPosition {
    // Return the current zero-based line and UTF-16 column.
    throw new Error("Implement getCursor");
  }

  getLines(): string[] {
    // Return the current buffer as logical lines.
    throw new Error("Implement getLines");
  }

  sendInputToEditor(data: string): void {
    // Send text or terminal-style control input to the host editor.
    throw new Error(`Implement sendInputToEditor: ${data}`);
  }

  undoEditor?(): void {
    // Restore one host undo point, if the host supplies undo.
  }

  redoEditor?(): void {
    // Restore one host redo point, if the host supplies redo.
  }
}

export const ModalTextEditor = VimEditor(TextEditorHost);
```

`sendInputToEditor()` must apply each input before it returns. The mixin reads the cursor and lines after each call.

| Input                                  | Required host action           |
| -------------------------------------- | ------------------------------ |
| Printable text                         | Insert text at the cursor.     |
| `\x1b[D`, `\x1b[B`, `\x1b[A`, `\x1b[C` | Move left, down, up, or right. |
| `\x01`, `\x05`                         | Move to the line start or end. |
| `\n`                                   | Insert a line break.           |
| `\x1b[3~`                              | Delete forward.                |
| `\x7f`                                 | Delete backward.               |

Create the state actor with the composed semantic editor:

```ts
import { createActor } from "xstate";
import { vimMachine } from "@thazhemadam/vim-state";
import { ModalTextEditor } from "./text-editor-host.js";

const host = new ModalTextEditor();
const actor = createActor(vimMachine, {
  input: { editor: host.vimEditor },
}).start();

actor.send({ type: "KEY", key: "escape" });
actor.send({ type: "KEY", key: "0" });
actor.send({ type: "KEY", key: "d" });
actor.send({ type: "KEY", key: "w" });
```

The machine starts in Insert mode. Send each key event to the actor first. If the machine remains in Insert mode, forward the input to the host editor. In Replace mode, forward printable input.

## Implement `VimEditorApi` directly

You can skip the mixin when your host has native semantic operations:

```ts
import { createActor } from "xstate";
import { vimMachine, type VimEditorApi } from "@thazhemadam/vim-state";

declare function createNativeEditorAdapter(): VimEditorApi;

const editor = createNativeEditorAdapter();
const actor = createActor(vimMachine, {
  input: { editor },
}).start();

actor.send({ type: "KEY", key: "escape" });
actor.send({ type: "KEY", key: "G" });
```

`VimEditorApi` defines semantic operations for movement, deletion, change, yank, put, case conversion, and undo.

## Events and snapshots

The current event vocabulary has one event type:

```ts
type VimEvent = {
  type: "KEY";
  key: string;
};
```

Send normalized names for non-printable keys. For example, send `escape`, `enter`, and `ctrl+r`. Send printable keys unchanged.

Use selectors to read user-visible state:

```ts
import {
  getVimMode,
  getVimModeLabel,
  isVimOperatorMode,
  isVimVisualMode,
} from "@thazhemadam/vim-state";

const snapshot = actor.getSnapshot();
console.log(getVimMode(snapshot));
console.log(getVimModeLabel(snapshot));
console.log(isVimOperatorMode(snapshot));
console.log(isVimVisualMode(snapshot));
```

`getVimMode()` returns `insert`, `normal`, or `replace`. `getVimModeLabel()` also exposes operator and Visual parser states for user interfaces.

The snapshot context contains these values:

- `editor`: the active `VimEditorApi`
- `count`: the pending command count
- `operator`: the pending delete, change, or yank operator
- `register`: the unnamed register
- `visual`: the active Visual selection

Treat the actor snapshot as read-only.

## Registers

The internal unnamed register stores character-wise or line-wise text:

```ts
type VimRegister = {
  text: string;
  type: "charwise" | "linewise";
};
```

The composed editor can notify a host after a register write:

```ts
host.vimEditor.setOptions({
  onUnnamedRegisterWrite(register) {
    copyToHostClipboard(register.text);
  },
});
```

The hook receives successful delete, change, yank, and Visual replacement writes. Leave the hook unset to keep registers internal.

## Linear history

`LinearHistory<Snapshot>` is a bounded, host-neutral undo and redo stack:

```ts
import { LinearHistory } from "@thazhemadam/vim-state";

const history = new LinearHistory<{ text: string }>(100);
history.commit({ text: "before edit" });

const previous = history.undo({ text: "after edit" });
const next = history.redo(previous ?? { text: "before edit" });
```

The class clones committed snapshots with `structuredClone()`. A new commit clears redo history. The class does not decide where edit boundaries occur.

## Public API

The package root exports:

- `vimMachine` and `VimSnapshot`
- `VimEditor()` and the editor contracts
- Event, context, state, motion, operator, register, and selection types
- `nounForKey()`
- `getVimMode()`, `getVimModeLabel()`, `isVimOperatorMode()`, and `isVimVisualMode()`
- `LinearHistory`

Read [`src/index.ts`](https://github.com/thazhemadam/vim-state/blob/main/packages/vim-state/src/index.ts) for the authoritative export surface.

## Semantics and limits

The package follows Vim behavior only for its implemented subset. Important current limits include:

- Positions use zero-based lines and UTF-16 string columns.
- Word motions use ASCII letters, digits, and `_` as word characters.
- WORD motions use whitespace boundaries.
- Character finds operate on the current line.
- Word text objects support only `iw` and `aw`.
- The machine does not parse terminal escape sequences.
- Insert-mode text, paste, autocomplete, and input method behavior belong to the host adapter.
- The package does not implement command-line mode, search, named registers, marks, macros, mappings, or plugins.

See the [pi-vim command reference](https://github.com/thazhemadam/vim-state/blob/main/packages/integrations/pi-vim/README.md#command-reference) for the commands that the current machine accepts.

## Development

From the repository root:

```bash
npm ci
npm run build
npm test --workspace @thazhemadam/vim-state
```

Run all checks before you submit a change:

```bash
npm run check
npm test
npm run check:packages
```

## License

This package uses the [GNU Lesser General Public License v3.0 only](LICENSE). The package also includes the corresponding [GNU GPL v3 text](LICENSE.GPL).
