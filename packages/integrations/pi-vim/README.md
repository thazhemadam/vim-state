# @thazhemadam/pi-vim

[![npm](https://img.shields.io/npm/v/%40thazhemadam%2Fpi-vim)](https://www.npmjs.com/package/@thazhemadam/pi-vim)
[![License: LGPL-3.0-only](https://img.shields.io/badge/license-LGPL--3.0--only-blue.svg)](LICENSE)

A [Pi](https://pi.dev) extension for Vim-style modal editing in the prompt editor.

The extension provides colored mode labels, mode-specific cursor shapes, Visual selections, registers, and linear undo history. It uses [`@thazhemadam/vim-state`](https://www.npmjs.com/package/@thazhemadam/vim-state) for host-neutral editing behavior.

## Requirements

- Node.js 22.19.0 or later
- `@earendil-works/pi-coding-agent` 0.79.8 through 0.84.2
- `@earendil-works/pi-tui` 0.79.8 through 0.84.2

The package declares this Pi range as peer dependencies. Releases outside this range do not receive compatibility checks.

## Install

Install the extension from npm:

```bash
pi install npm:@thazhemadam/pi-vim
```

Then start or restart Pi. The prompt starts in Insert mode.

Run this Pi command to verify that the extension loaded:

```text
/pi-vim-status
```

Use `pi config` to enable or disable the extension after installation. To remove an npm installation:

```bash
pi remove npm:@thazhemadam/pi-vim
```

## First steps

1. Type a prompt in Insert mode.
2. Press `Escape` to enter Normal mode.
3. Use Vim commands to edit the prompt.
4. Press `i` to return to Insert mode.
5. Press `Enter` in Normal mode to submit the prompt.

If autocomplete is open, the first `Escape` closes autocomplete. Press `Escape` again to enter Normal mode.

The label at the lower-right edge shows the active parser state:

- `INSERT`
- `NORMAL`
- `OPERATOR`
- `VISUAL`
- `VISUAL LINE`
- `REPLACE`

The terminal cursor also changes by mode. Insert mode uses a bar. Normal and Visual modes use a block. Replace and operator states use an underline.

## Command reference

Only the commands listed below are supported. Host keys that pass through to Pi are described under [Pi behavior](#pi-behavior).

### Modes and insert entry

| Key       | Action                                                   |
| --------- | -------------------------------------------------------- |
| `Escape`  | Leave Insert, Replace, Visual, or operator-pending mode. |
| `i`       | Insert before the cursor.                                |
| `a`       | Insert after the cursor.                                 |
| `I`       | Insert before the first non-blank character.             |
| `A`       | Insert at the end of the line.                           |
| `o`       | Open a line below and enter Insert mode.                 |
| `O`       | Open a line above and enter Insert mode.                 |
| `r{char}` | Replace one character.                                   |
| `R`       | Enter Replace mode.                                      |
| `v`       | Enter character-wise Visual mode.                        |
| `V`       | Enter line-wise Visual mode.                             |

### Motions

| Key                     | Action                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| `h`, `j`, `k`, `l`      | Move left, down, up, or right.                                     |
| `0`                     | Move to the start of the line.                                     |
| `^`, `_`                | Move to the first non-blank character.                             |
| `$`                     | Move to the end of the line.                                       |
| `w`, `b`, `e`           | Move by Vim-style words.                                           |
| `W`, `B`, `E`           | Move by whitespace-delimited WORDS.                                |
| `f{char}`, `F{char}`    | Find a character forward or backward on the line.                  |
| `t{char}`, `T{char}`    | Move just before a forward target or just after a backward target. |
| `gg`                    | Move to the first line.                                            |
| `G`                     | Move to the last line.                                             |
| `{count}gg`, `{count}G` | Move to the specified one-based line number.                       |

A word contains ASCII letters, digits, or `_`. Adjacent punctuation is a separate word. A WORD is any non-whitespace run.

### Operators, edits, and registers

| Key              | Action                                                                        |
| ---------------- | ----------------------------------------------------------------------------- |
| `d{motion}`      | Delete the motion range.                                                      |
| `c{motion}`      | Change the motion range and enter Insert mode.                                |
| `y{motion}`      | Yank the motion range.                                                        |
| `dd`, `cc`, `yy` | Delete, change, or yank whole lines.                                          |
| `iw`, `aw`       | Select an inner word or a word with surrounding whitespace after an operator. |
| `x`, `X`         | Delete the character under or before the cursor.                              |
| `D`, `C`         | Delete or change through the end of the line.                                 |
| `p`, `P`         | Put the unnamed register after or before the cursor.                          |
| `J`              | Join lines.                                                                   |
| `~`              | Toggle character case.                                                        |
| `u`              | Undo one pi-vim edit.                                                         |
| `Ctrl-R`         | Redo one pi-vim edit.                                                         |

Operators support `h`, `j`, `k`, `l`, `0`, `$`, `^`, `_`, `w`, `b`, `e`, `W`, `B`, `E`, `f`, `F`, `t`, and `T`. They also support `iw` and `aw`.

Counts work with:

- `h`, `j`, `k`, `l`, `w`, `b`, `e`, `W`, `B`, `E`, `f`, `F`, `t`, `T`, `gg`, and `G`
- `d`, `c`, and `y` with those motions except `gg` and `G`, with `$`, or as `dd`, `cc`, and `yy`
- `x`, `X`, `D`, `C`, `p`, `P`, `J`, and `~`

Counts do not apply to `0`, `^`, `_`, `iw`, or `aw`.

The editor stores at most 100 undo snapshots. One Insert or Replace session is one undo step. A new edit after undo clears the redo path.

### Visual mode

Use `h`, `j`, `k`, `l`, `0`, `$`, `^`, `_`, `w`, `b`, `e`, `W`, `B`, `E`, or `G` to extend a Visual selection. Counts work with `h`, `j`, `k`, `l`, `w`, `b`, `e`, `W`, `B`, `E`, and `G`.

Then use one of these keys:

| Key      | Action                                           |
| -------- | ------------------------------------------------ |
| `o`, `O` | Swap the selection anchor and active end.        |
| `y`      | Yank the selection.                              |
| `d`, `x` | Delete the selection.                            |
| `c`      | Change the selection and enter Insert mode.      |
| `p`, `P` | Replace the selection with the unnamed register. |
| `~`      | Toggle the case of the selection.                |
| `u`, `U` | Convert the selection to lowercase or uppercase. |
| `J`      | Join the selected lines.                         |

## Clipboard and registers

Delete, change, yank, and Visual replacement commands write to the internal unnamed register. By default, the extension also copies these writes to the system clipboard.

Start Pi with this flag to keep register writes local:

```bash
pi --pi-vim-local-registers
```

This flag stops outgoing clipboard copies. The extension does not read clipboard text into the unnamed register.

## Pi behavior

The adapter keeps these Pi editor behaviors:

- `Enter` submits a prompt in Insert, Normal, or Visual mode.
- Pi retains its normal `Up` and `Down` prompt-history behavior in Insert and Normal modes.
- Pi clear, suspend, and exit shortcuts continue to work in Insert and Normal modes.
- In Normal mode, `Escape` runs the Pi interrupt action.
- Pi autocomplete receives `Escape` before Vim leaves Insert or Replace mode.
- Programmatic text insertion creates one undoable edit.

## Limitations

This package implements a Vim subset, not a Vim runtime. It does not support these features:

- Command-line mode and `:` commands
- `/` and `?` search
- Named registers
- Marks, macros, and key mappings
- The repeat command (`.`)
- Most text objects
- Plugins or a `vimrc`

Positions use UTF-16 string columns, so some multi-code-point graphemes behave differently than they do in Vim.

Visual highlighting uses the wrapped Pi editor layout. Use a Pi version in the declared compatibility range to avoid layout errors.

## Local development

From the repository root:

```bash
npm ci
npm run dev:pi
```

The development command builds both packages and starts Pi with only the extensions in this checkout. It also inserts a multi-line sample prompt.

Run the package tests directly with:

```bash
npm test --workspace @thazhemadam/pi-vim
```

Run all repository checks before you submit a change:

```bash
npm run check
npm test
npm run check:packages
```

## Programmatic exports

The package default export is the Pi extension factory. It also exports these integration helpers:

- `VimPiEditor`
- `normalizePiKey`
- `piInputToVimEvent`
- `isPrintablePiInput`

It re-exports the public API from [`@thazhemadam/vim-state`](https://github.com/thazhemadam/vim-state/blob/main/packages/vim-state/README.md).

## License

This package uses the [GNU Lesser General Public License v3.0 only](LICENSE). The package also includes the corresponding [GNU GPL v3 text](LICENSE.GPL).
