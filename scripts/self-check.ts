import assert from "node:assert/strict";

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

console.log("vim-pi self-check passed");
