import assert from "node:assert/strict";
import test from "node:test";

import { VimEditor, type VimEditorHost } from "../src/editor.js";

class FakeHost implements VimEditorHost {
  inputs: string[] = [];
  registers: string[] = [];
  undoCount = 0;
  redoCount = 0;
  lines = ["abc"];
  cursor = { line: 0, col: 1 };

  getCursor(): { line: number; col: number } {
    return this.cursor;
  }

  getLines(): string[] {
    return this.lines;
  }

  undoEditor(): void {
    this.undoCount += 1;
  }

  redoEditor(): void {
    this.redoCount += 1;
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

  editor.vimEditor.move("left");
  editor.vimEditor.delete("right");

  assert.deepEqual(editor.inputs, ["\x01", "\x01", "\x1b[3~"]);
  assert.deepEqual(editor.lines, ["abc"]);
});

test("VimEditor stops vertical movement when the host intercepts arrow input", () => {
  const editor = new FakeVimEditor();
  editor.lines = ["abc", "def"];
  editor.cursor = { line: 0, col: 1 };

  editor.vimEditor.move("down");

  assert.deepEqual(editor.inputs, ["\x1b[B"]);
  assert.deepEqual(editor.cursor, { line: 0, col: 1 });
});

test("VimEditor emits unnamed-register writes to the configured hook", () => {
  const editor = new FakeVimEditor();
  editor.vimEditor.setOptions({
    onUnnamedRegisterWrite: (register) => editor.registers.push(register.text),
  });

  editor.vimEditor.yank("right");
  editor.vimEditor.delete("right");
  editor.vimEditor.change("right");
  editor.vimEditor.replace("right", { text: "x", type: "charwise" });
  editor.vimEditor.replaceCharUnderCursor("z");

  assert.deepEqual(editor.registers, ["b", "b", "b", "b"]);
});

test("VimEditor keeps unnamed-register writes internal without a hook", () => {
  const editor = new FakeVimEditor();

  editor.vimEditor.yank("right");

  assert.deepEqual(editor.registers, []);
});

test("VimEditor mixin delegates undo to the host editor", () => {
  const editor = new FakeVimEditor();

  editor.vimEditor.undo();

  assert.equal(editor.undoCount, 1);
});

test("VimEditor mixin delegates redo to the host editor", () => {
  const editor = new FakeVimEditor();

  editor.vimEditor.redo();

  assert.equal(editor.redoCount, 1);
});
