# vim-pi implementation approach

vim-pi is a Pi extension for Vim-style modal editing. The project goal is not to invent a vaguely Vim-like editor, but to implement a small, testable modal engine whose transitions and editing semantics are grounded in Vim documentation and validated against real Neovim behavior.

## Source-of-truth hierarchy

We will use these sources in descending order of authority:

1. **Official Vim documentation and behavior** for mode names, mode transitions, operators, motions, and edge cases.
2. **Observed Neovim behavior** as a runtime oracle for transition tests and semantic golden tests.
3. **Active Learning Neovim** as a reference approach for extracting/validating a mode-transition Moore machine from Neovim.
4. **Kenny Pete's “Navigating the modes of Vim” diagram** as a coverage checklist and textbook-style reference, not as copied source data.
5. **Our own regression tests** as the project-local record of behavior we support.

## Why not copy a single DFA?

Vim's top-level modes are finite, but complete Vim editing behavior is not well represented as a plain DFA unless we abstract or bound contextual data. Vim commands can depend on counts, registers, pending operators, search strings, command-line text, mappings, previous visual selections, jumplist state, buffer contents, completion state, and more.

Active Learning Neovim demonstrates this directly: it configures Neovim to “force” finite-state behavior and disables/remaps behavior that would otherwise depend on the jumplist, previous visual selections, inserted text, command-line commands, or buffer contents. See its setup comments around finite-state constraints and key remappings.

Therefore our model will be an **XState-backed extended finite-state machine**:

```text
adapter raw input -> VimEvent -> XState actor -> typed editor method
```

- XState owns the modal/control statechart: current mode, transient parser state, and bounded context such as count, pending operator, register, visual anchor, and command-line buffer.
- Adapters translate host input into normalized `VimEvent` values.
- The machine context receives an object that satisfies the core `VimEditorApi` contract.
- XState action implementations call that contract directly. The core Vim package does not import Pi.

## Core/adapters boundary

The reusable core should be usable outside Pi. Pi is only one adapter.

Planned shape:

```text
src/
  vim/
    machine.ts        XState machine/statechart
    context.ts        Vim context: editor dependency, count, register, pending operator, etc.
    editor/           reusable editor mixin, host contract, constants, helpers
    events.ts         normalized key event contract
    selectors.ts      helpers such as mode labels and mode checks
    keymap.ts         generic key normalization where host-independent
  adapters/
    pi/
      extension.ts    Pi extension entrypoint
      editor.ts       CustomEditor adapter implementing VimEditor
      keymap.ts       Pi key bytes -> VimEvent
  index.ts            reusable public API, not Pi-specific
```

The adapter sends events into the machine; the machine calls the reusable `VimEditor` mixin through the `VimEditorApi` contract. The adapter should not define Vim semantics.

Text mutation responsibility stays with the host editor. The Vim mixin decides semantic commands such as “delete the Normal-mode character under the cursor” or “insert a line below”; it does not own a text buffer or reimplement insertion/deletion mechanics. It requests raw host-editor mutations through `VimEditorHost.sendInputToEditor()`, and each adapter maps that to its native primitive, e.g. Pi forwards to `CustomEditor.handleInput()`.

Undo/redo follows that boundary too. Vim's native undo model tracks edit changes, including one undo block for a typical Insert-mode session and separate blocks for Normal/Visual mutations; cursor-only movement is not a change. vim-pi implements a linear snapshot history for the Pi adapter rather than Vim's full undo tree. Normal `u` pops a vim-pi undo snapshot, pushes the current public state to redo, and restores the prior `{ text, cursor }` state. Normal `<C-r>` performs the inverse. A new text edit pushes the pre-edit snapshot to undo and clears redo, so abandoned redo paths are discarded instead of retained as branches.

The Pi adapter owns this linear history because Pi owns the text buffer and vim-pi cannot modify Pi editor internals. Insert and Replace sessions commit one undo block when they leave Insert/Replace, including commands that both mutate and enter Insert such as `cw`, `cc`, `o`, and `O`. Normal and Visual text-changing commands commit one undo block immediately. Visual `u` is a lowercase transform, not undo, so it is treated as a new edit and clears redo. History restores use public setters and cursor movement, so they restore public text/cursor state only; Pi private state such as autocomplete, kill-ring internals, prompt-history browsing state, and paste storage is not restored. Prompt submission and prompt-history navigation reset the history baseline.

The initial event contract is deliberately one event:

```ts
export interface VimKeyEvent {
  type: "KEY";
  key: string;
}

export type VimEvent = VimKeyEvent;
```

`key` is a normalized key token, such as `"a"`, `"escape"`, `"enter"`, or `"ctrl-v"`. Printable characters are still keys. The machine decides whether `"a"` means “insert the letter a” in Insert mode or “append after cursor” in Normal mode.

Do not add `TEXT` or `PASTE` events to the core model for the initial implementation. Paste, bracketed paste, IME composition, and host-specific text input are adapter concerns. If needed, an adapter can expand pasted text into a sequence of `{ type: "KEY", key }` events until we have a Vim-semantics reason to model something richer.

## Top-level modal model

The top-level XState states will follow Vim's observable `mode()` states where practical:

- Normal: `n`
- Operator-pending: `no`, `nov`, `noV`, `no<C-V>`
- Insert/Replace: `i`, `R`, `Rv`, plus completion variants later
- Visual: `v`, `V`, `<C-V>`
- Select: `s`, `S`, `<C-S>` later
- Command-line/Ex: `c`, `cr`, `cv`, `cvr`, `ce` later
- Terminal and prompt modes are out of scope for the first Pi editor milestone

Internally, Vim's `MODE_VISUAL`, `MODE_SELECT`, and `MODE_OP_PENDING` are condition-derived rather than always literal `State` values, so our implementation should not treat one flat enum as sufficient for all semantics. We will model observable mode plus parser context explicitly.

## Command parser model

Normal mode will be implemented in the XState statechart with transient states for multi-key commands and prefixes, for example:

- count accumulation: `3`, `12`, etc.
- register prefix: `"a`, `"+`, etc.
- operator-pending: `d`, `c`, `y`, `g~`, `gu`, `gU`, `=`, `>`, `<`, `!`, etc.
- motion/input prefixes: `g`, `z`, `f{char}`, `t{char}`, `r{char}`
- text objects after an operator: `iw`, `aw`, `i"`, `a)`, etc.

Terminal command states call methods on the `VimEditorApi` contract. The reusable `VimEditor` mixin implements those methods with `VimEditorHost` operations, and tests can pass a fake `VimEditorApi` without running Pi's TUI.

Cursor semantics are part of the command parser contract, not adapter trivia. The roadmap defines the initial coordinate policy explicitly: Insert mode uses an insertion caret between characters, while Normal/Visual mode uses a cursor on a character. Transitions such as `i`, `a`, `A`, `I`, `o`, `O`, and `<Esc>` must specify both mode and cursor/caret position. This follows Vim's Insert-mode command documentation and Vim's `ins_esc()` cursor adjustment, which places the Normal-mode cursor on the last inserted character when leaving Insert mode.

## Validation strategy

### 1. Mode-transition oracle

For a key sequence, run both engines:

```text
key sequence
  ├─ headless Neovim      -> nvim_get_mode() / mode()
  └─ vim-pi XState core   -> predicted mode
```

The test passes when modes agree for the supported subset. This mirrors the Active Learning Neovim strategy, but we will use it as a validation oracle rather than as the implementation itself.

### 2. Editing semantic tests

For buffer mutations, compare full editor state:

```text
initial buffer + cursor + registers + keys
  -> expected buffer + cursor + registers + mode
```

Where feasible, expected results should be generated or checked against Neovim. For tricky cases, we will add golden fixtures with citations to Vim help.

### 3. Coverage checklist

Kenny Pete's diagram is useful for asking “did we account for this mode or transition?” It is not a machine-readable source for this package, and we will not embed or mechanically derive transition data from it.

## Initial milestones

The incremental implementation plan lives in [roadmap.md](roadmap.md). In short, we will build from a reusable XState core shell, to a Pi modal shell, to basic Normal navigation and Insert-entry commands, to simple edits, counts, operator-pending, word motions, Visual mode, registers, text objects, and later compatibility features. Every milestone should include explicit mode, cursor, and buffer assertions.

## References

- XState machines and pure transition helpers: <https://stately.ai/docs/machines>
- Vim modes introduction and mode-switching table: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/intro.txt#L561-L690>
- Vim `mode()` observable mode codes: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/builtin.txt#L7874-L7927>
- Vim operators, motions, linewise/characterwise/inclusive semantics: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/motion.txt#L40-L105>
- Vim Insert/Replace exit commands: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/insert.txt#L48-L58>
- Vim insert-entry command docs (`a`, `A`, `i`, `I`, `o`, `O`): <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/insert.txt#L2020-L2069>
- Vim `ins_esc()` cursor adjustment source: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/src/edit.c#L3742-L3839>
- Vim internal `State` mode bit flags: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/src/vim.h#L724-L749>
- Vim `get_real_state()` note that Visual/Select/Operator-pending are condition-derived: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/src/misc2.c#L1990-L2008>
- Active Learning Neovim repository: <https://github.com/pierreganty/active-learning-neovim>
- Active Learning Neovim finite-state constraints and remappings: <https://github.com/pierreganty/active-learning-neovim/blob/2acfa93fccbaf7e745e84372d711ddecc40c134d/aalpy_neovim.py#L29-L73>
- Active Learning Neovim mode-code mapping: <https://github.com/pierreganty/active-learning-neovim/blob/2acfa93fccbaf7e745e84372d711ddecc40c134d/aalpy_neovim.py#L76-L110>
- Active Learning Neovim learning/export function: <https://github.com/pierreganty/active-learning-neovim/blob/2acfa93fccbaf7e745e84372d711ddecc40c134d/aalpy_neovim.py#L134-L152>
- “Learning the State Machine Behind a Modal Text Editor: The (Neo)Vim Case Study”: <https://spin-web.github.io/SPIN2024/assets/preproceedings/SPIN2024-paper9.pdf>
- Kenny Pete, “Navigating the modes of Vim”: <https://gist.github.com/kennypete/1fae2e48f5b0577f9b7b10712cec3212>
- Kenny Pete SVG version: <https://filedn.eu/leYRsoeL3vrLdST6YRh2hyu/gist/vim9_modes.svg>
- Darcy Parker, “VIM Modes Transition Diagram”: <https://gist.github.com/darcyparker/1886716>

## Licensing note

Kenny Pete's diagram is licensed CC BY-NC-SA. We use it as a human reference, analogous to consulting a textbook, and do not copy the diagram, embed it, or mechanically derive package data from it.
