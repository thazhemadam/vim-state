# Incremental implementation roadmap

This roadmap keeps the implementation small, useful, and verifiable at every step. Each milestone should add a narrow slice of Vim behavior plus tests for mode, cursor, and buffer effects.

## XState architecture policy

Use XState for the reusable Vim modal/control model. The core machine owns Vim states, parser substates, and bounded Vim context. Host adapters translate input and provide the `VimEditorHost` primitives used by the reusable `VimEditor` mixin.

```text
raw host input -> VimEvent -> XState actor -> typed editor method
```

Planned core files:

```text
packages/vim-state/src/machine.ts      XState machine/statechart
packages/vim-state/src/context.ts      Vim machine context
packages/vim-state/src/editor/         reusable editor mixin, host contract, constants, helpers
packages/vim-state/src/events.ts       normalized event vocabulary
packages/vim-state/src/selectors.ts    mode labels and snapshot helpers
```

Planned Pi adapter files:

```text
packages/integrations/pi-vim/src/extension.ts
packages/integrations/pi-vim/src/editor.ts
packages/integrations/pi-vim/src/keymap.ts
```

The core must not import Pi. Pi should be replaceable with another host editor without changing Vim semantics.

## Commit format for paired feature slices

When a feature needs both reusable Vim semantics and Pi adapter wiring, split it into two commits with matching language:

```text
feat(vim): emit <feature> actions for <keys>
feat(pi): apply <feature> actions for <keys>
```

Examples:

```text
feat(vim): emit character navigation actions for h, j, k and l
feat(pi): apply character navigation actions for h, j, k and l
feat(vim): emit insert-entry actions for a, A and I
feat(pi): apply insert-entry actions for a, A and I
```

Use `fix(pi): ...` for adapter-only bugs and `docs: ...` for roadmap/reference updates.

## Coordinate and cursor policy

We must be explicit about cursor position because Vim uses different mental models in Insert and Normal mode.

vim-pi's pure editor model should use zero-based coordinates:

```ts
interface Cursor {
  line: number; // 0-based line index
  column: number; // 0-based UTF-16/string column for the initial implementation
}
```

The semantic meaning of `column` depends on mode:

- **Insert mode:** `column` is an insertion caret between characters. Valid range is `0..line.length`.
- **Normal/Visual mode:** `column` is on a buffer character. Valid range is `0..max(line.length - 1, 0)`; empty lines use column `0`.

This distinction is essential for transitions between Insert and Normal mode.

Editor method names should use **cursor** for Normal-mode, on-character placement and **caret** for Insert-mode, between-character placement. If a method represents the same column movement in either mode, use cursor terminology and let the current Vim state determine whether the host renders that position as a Normal cursor or Insert caret.

### Leaving Insert/Replace mode

Vim help says `<Esc>`/`CTRL-[` ends Insert or Replace mode and returns to Normal mode, while `CTRL-C` also returns to Normal mode but skips abbreviation and `InsertLeave` handling. Vim source then makes the cursor land on the last inserted character: `ins_esc()` says “The cursor should end up on the last inserted character” and moves one column left when appropriate.

Therefore vim-pi should implement:

```text
Insert caret column C --Esc--> Normal cursor column clamp(C - 1)
```

Examples, with `|` as Insert caret and `[]` as Normal cursor:

```text
Insert:  ab|c    Esc -> Normal: a[b]c
Insert:  abc|    Esc -> Normal: ab[c]
Insert:  |abc    Esc -> Normal: [a]bc
Insert:  |       Esc -> Normal: []
```

If text was inserted immediately before leaving Insert mode, this naturally places the Normal cursor on the final inserted character:

```text
Normal:  a[b]c
keys:    iX<Esc>
result:  a[X]bc
```

### Entering Insert mode from Normal mode

The first milestone should support these mode-entry commands with exact cursor placement:

| Command | Vim meaning                   | vim-pi cursor/caret transition                                                                     |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| `i`     | Insert before cursor          | Normal column `C` -> Insert caret `C`                                                              |
| `a`     | Append after cursor           | Normal column `C` -> Insert caret `min(C + 1, line.length)`; on an empty line, caret stays `0`     |
| `I`     | Insert before first non-blank | Insert caret at first non-blank column, or `0` for blank/empty lines in the initial implementation |
| `A`     | Append at end of line         | Insert caret at `line.length`                                                                      |
| `o`     | Open line below and insert    | Create a new line below; Insert caret at indentation/start of new line                             |
| `O`     | Open line above and insert    | Create a new line above; Insert caret at indentation/start of new line                             |

The Vim docs define these commands as append-after-cursor (`a`), append-at-end (`A`), insert-before-cursor (`i`), insert-before-first-nonblank (`I`), and opening lines above/below (`O`/`o`). Autoindent and related options should be deferred until a later milestone.

## Milestone 1a: XState core shell

Goal: prove the reusable XState core exists before wiring it to any host editor.

Features:

- Add `xstate` and define the first `packages/vim-state/src/machine.ts` machine.
- Model only `insert` and `normal` states.
- `KEY escape` switches Insert -> Normal and calls `moveCursorLeft` on the editor contract.
- `KEY i` switches Normal -> Insert without an editor method because Pi's caret already sits before the Normal cursor.
- Unmapped keys leave state unchanged and call no editor methods.

Tests:

- XState transition test for initial mode, `escape`, `i`, and one no-op key.
- Typecheck the core.

## Milestone 1b: Pi modal shell only

Goal: prove Pi can run the editor wrapper and mode indicator without implementing editing commands.

Adapter files:

```text
packages/integrations/pi-vim/src/extension.ts    Pi extension entrypoint
packages/integrations/pi-vim/src/editor.ts       CustomEditor wrapper that owns the XState actor and implements VimEditor
packages/integrations/pi-vim/src/keymap.ts       raw Pi key input -> { type: "KEY", key: string }
```

Interaction flow:

```text
Pi CustomEditor.handleInput(rawKey)
  -> normalize rawKey to { type: "KEY", key }
  -> send event to XState actor
  -> XState actions call VimEditor methods on the Pi editor
  -> render mode label from the actor snapshot
```

Features:

- Start in Insert mode from the XState core.
- Route Pi key input through the core machine.
- Apply `moveCursorLeft` with the cursor rule above: Insert caret column `C` becomes Normal cursor column `clamp(C - 1).`
- Normal `i` needs no Pi adapter action: Normal cursor column `C` already becomes Insert caret column `C`.
- Normal mode ignores printable keys not yet mapped by the core.
- Insert mode delegates ordinary text input to Pi/default editor behavior after the core accepts the key as an Insert-mode no-op.
- Render a mode indicator: `INSERT` / `NORMAL`.

Behavior target:

```text
start in insert
type abc      -> abc inserted
Esc           -> normal, cursor on c
type xyz      -> ignored by normal mode
i             -> insert before c
type X        -> inserted before c
```

Still out of scope:

- `h/j/k/l` navigation
- deletion or text mutation actions from the Vim core
- counts, operators, visual mode, registers, text objects
- Neovim oracle tests

Tests:

- Cursor tests for leaving Insert at start, middle, and end of line.
- Interaction smoke test that the Pi extension installs a `CustomEditor` and routes `escape`/`i` through the XState core.

## Milestone 2: basic Normal navigation and Insert entry

Features:

- `h`, `j`, `k`, `l`
- `0`, `$`
- `a`, `A`, `I`
- `o`, `O` without autoindent initially
- Arrow keys may continue to work through the base editor if they do not conflict

Tests:

- Cursor movement clamps at line boundaries.
- `a`, `A`, `I`, `o`, and `O` enter Insert mode with documented caret placement.
- `Esc` after each Insert-entry command returns to the expected Normal cursor position.

## Milestone 3: simple destructive edits

Features:

- `x` delete character under cursor
- `X` delete character before cursor
- `r{char}` replace character under cursor

Tests:

- Buffer and cursor after deletion at start, middle, end, and empty lines.
- `r{char}` replaces the current character and leaves the Normal cursor on the replacement.
- `r<Esc>` cancels replacement without changing the buffer.

## Milestone 4: counts

Features:

- Count accumulation for Normal commands: `3h`, `10l`, `3x`, `5j`
- `0` remains line-start when no prior count, but becomes part of a count after a nonzero digit

Tests:

- Count parser state transitions in XState context.
- Count application and clamping.
- Mode returns to Normal after counted terminal actions.

## Milestone 5: operator-pending basics

Features:

- `d`, `c`, `y` enter operator-pending
- Doubled operators: `dd`, `cc`, `yy`
- Operator + simple motions: `dh`, `dl`, `dj`, `dk`, `d0`, `d$`, and analogous `c`/`y`

Deliberately skipped for now:

- `s` and `S`; use `cl`/`cc` instead until single-key change commands are worth the extra surface area.

Tests:

- Mode sequence agrees with Neovim for supported key sequences.
- Operator range calculation is separately unit-tested.
- `c` actions switch to Insert with documented cursor/caret placement after the change.

## Milestone 6: word motions

Features:

- `w`, `b`, `e`
- Counted word motions: `3w`, `2b`
- Operator support: `dw`, `cw`, `yw`

Tests:

- Word-boundary fixtures across whitespace and punctuation.
- Operator ranges for word motions.
- `cw` cursor placement compared against Neovim golden cases.

## Milestone 7: Visual mode subset

Features:

- `v` visual-char
- `V` visual-line
- Existing motions extend selection
- Visual `d`, `c`, `y`, `x`
- `Esc` exits Visual mode back to Normal

Tests:

- Visual anchor and active end tracking.
- Buffer effects for visual delete/change/yank.
- XState mode transitions compared with Neovim for supported sequences.

## Milestone 8: unnamed register and put

Features:

- Unnamed register populated by `y`, `d`, and `c`
- `p`, `P`
- Linewise vs characterwise register metadata

Tests:

- Register contents and type after each operator.
- Put placement and cursor position after `p`/`P`.

## Milestone 9: text objects

Features:

- `iw`, `aw`
- `i"`, `a"`
- `i'`, `a'`
- `i(`, `a(`, `i[`, `a[`

Tests:

- Operator-pending text object parser states.
- Range calculation around nested or missing delimiters.
- `ci"`, `diw`, and `ya)` golden cases.

## Milestone 10: compatibility expansion

Later features:

- `g` prefix commands
- `z` prefix commands where useful in a prompt editor
- `f`, `F`, `t`, `T`, `;`, `,`
- dot repeat `.`
- explicit registers: `"a`, `"+`, etc.
- command-line mode `:` for extension-local editor commands, if useful
- Visual block only if Pi's prompt editor model can represent it well

## References

- XState machines and pure transition helpers: <https://stately.ai/docs/machines>
- Vim Insert/Replace exit commands: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/insert.txt#L48-L58>
- Vim Insert-mode `CTRL-O` cursor note: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/insert.txt#L399-L421>
- Vim insert-entry command docs (`a`, `A`, `i`, `I`, `o`, `O`): <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/runtime/doc/insert.txt#L2020-L2069>
- Vim `ins_esc()` cursor adjustment source: <https://github.com/vim/vim/blob/44a1a6a33171ee34dddccf5236c38791fb489dfc/src/edit.c#L3742-L3839>
