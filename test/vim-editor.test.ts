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

    if (data === "\x01") {
      this.cursor.col = 0;
    }
    if (data === "\x1b[C") {
      this.cursor.col += 1;
    }
    if (data === "\x1b[D") {
      this.cursor.col = Math.max(0, this.cursor.col - 1);
    }
  }
}

const FakeVimEditor = VimEditor(FakeHost);

test("VimEditor mixin forwards semantic edits to the host editor", () => {
  const editor = new FakeVimEditor();

  editor.move("left");
  editor.delete("right");

  assert.deepEqual(editor.inputs, ["\x01", "\x01", "\x1b[3~"]);
  assert.deepEqual(editor.lines, ["abc"]);
});
