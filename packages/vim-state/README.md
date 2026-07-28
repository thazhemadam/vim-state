# vim-state

Reusable Vim modal state and host-neutral editing semantics.

`vim-state` provides the XState machine, editor host contract, motions, operators, selectors, register types, and linear undo/redo history used by host integrations.

## Usage

```ts
import { createActor } from "xstate";
import { vimMachine, type VimEditorApi } from "vim-state";

const editor: VimEditorApi = createHostEditor();
const vim = createActor(vimMachine, { input: { editor } }).start();
vim.send({ type: "KEY", key: "escape" });
```

Host integrations must implement `VimEditorHost` or provide a `VimEditorApi`. This package does not depend on any host UI framework.
