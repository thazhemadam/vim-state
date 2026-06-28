import assert from "node:assert/strict";
import test from "node:test";

import { VimEditor, type VimEditorHost } from "../src/vim/editor.js";

class FakeHost implements VimEditorHost {
  inputs: string[] = [];
  lines = ["abc"];
  cursor = { line: 0, col: 1 };

  getCursor(): { line: number; col: number } {
    return this.cursor;
  }

  getLines(): string[] {
    return this.lines;
  }

  sendInputToEditor(data: string): void {
    this.inputs.push(data);
  }
}

const FakeVimEditor = VimEditor(FakeHost);

test("VimEditor mixin forwards semantic edits to the host editor", () => {
  const editor = new FakeVimEditor();

  editor.moveCursorLeft();
  editor.deleteCharUnderCursor();

  assert.deepEqual(editor.inputs, ["\x1b[D", "\x1b[3~"]);
  assert.deepEqual(editor.lines, ["abc"]);
});
