import assert from "node:assert/strict";

import vimPiExtension, { VimPiEditor } from "../src/index.js";
import { applyVimActionToPiEditor } from "../src/adapters/pi/apply-action.js";
import { normalizePiKey } from "../src/adapters/pi/keymap.js";
import {
  getInitialVimSnapshot,
  transitionVim,
  type VimSnapshot,
} from "../src/vim/transition.js";
import { getVimMode } from "../src/vim/selectors.js";

let result = getInitialVimSnapshot();
assert.equal(getVimMode(result.snapshot), "insert");
assert.deepEqual(result.actions, []);

result = transitionVim(result.snapshot, { type: "KEY", key: "escape" });
assert.equal(getVimMode(result.snapshot), "normal");
assert.deepEqual(result.actions, [{ type: "placeCursorOnPreviousCharacter" }]);

const snapshotBeforeNoop: VimSnapshot = result.snapshot;
result = transitionVim(result.snapshot, { type: "KEY", key: "escape" });
assert.equal(result.snapshot.value, snapshotBeforeNoop.value);
assert.deepEqual(result.actions, []);

result = transitionVim(result.snapshot, { type: "KEY", key: "i" });
assert.equal(getVimMode(result.snapshot), "insert");
assert.deepEqual(result.actions, [{ type: "placeCaretBeforeCursor" }]);

assert.equal(normalizePiKey("\x1b"), "escape");
assert.equal(normalizePiKey("i"), "i");

const cursorTarget = (col: number) => ({
  col,
  getCursor: () => ({ line: 0, col }),
  moveCaretLeft: () => {
    col -= 1;
  },
});
let target = cursorTarget(0);
applyVimActionToPiEditor({ type: "placeCursorOnPreviousCharacter" }, target);
assert.equal(target.getCursor().col, 0);
target = cursorTarget(2);
applyVimActionToPiEditor({ type: "placeCursorOnPreviousCharacter" }, target);
assert.equal(target.getCursor().col, 1);
applyVimActionToPiEditor({ type: "placeCaretBeforeCursor" }, target);
assert.equal(target.getCursor().col, 1);

let installedFactory: unknown;
vimPiExtension({
  on: (event: string, handler: unknown) => {
    if (event === "session_start") {
      (handler as (event: unknown, ctx: unknown) => void)(undefined, {
        ui: { setEditorComponent: (factory: unknown) => (installedFactory = factory) },
      });
    }
  },
  registerCommand: () => {},
} as never);
assert.equal(typeof installedFactory, "function");

const fakeTui = { terminal: { rows: 24 }, requestRender: () => {} };
const fakeTheme = { borderColor: (value: string) => value, selectList: {} };
const fakeKeybindings = { matches: () => false };
const editor = new VimPiEditor(fakeTui as never, fakeTheme as never, fakeKeybindings as never);
for (const key of ["a", "b", "c", "\x1b", "x", "y", "z", "i", "X"]) editor.handleInput(key);
assert.equal(editor.getText(), "abXc");
assert.deepEqual(editor.getCursor(), { line: 0, col: 3 });
assert.equal(getVimMode(editor.getVimSnapshot()), "insert");
assert.match(editor.render(40).at(-1) ?? "", /-- INSERT --$/);

console.log("vim-pi self-check passed");
