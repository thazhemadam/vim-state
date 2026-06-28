import assert from "node:assert/strict";
import test from "node:test";

import vimPiExtension, { VimPiEditor } from "../src/index.js";
import { matchesKey } from "@earendil-works/pi-tui";

import { normalizePiKey } from "../src/adapters/pi/keymap.js";
import { getVimMode } from "../src/vim/selectors.js";

const ESC = "\x1b";

test("Pi keymap normalizes raw input into Vim keys", () => {
  assert.equal(normalizePiKey(ESC), "escape");
  assert.equal(normalizePiKey("i"), "i");
  assert.equal(normalizePiKey("\x1b[99;5u"), "ctrl+c");
});

test("Pi extension installs a Vim editor", () => {
  let installedFactory: unknown;
  vimPiExtension({
    on: (event: string, handler: unknown) => {
      if (event === "session_start") {
        (handler as (event: unknown, ctx: unknown) => void)(undefined, {
          ui: {
            setEditorComponent: (factory: unknown) =>
              (installedFactory = factory),
          },
        });
      }
    },
    registerCommand: () => {},
  } as never);

  assert.equal(typeof installedFactory, "function");
});

test("VimPiEditor tracks mode and cursor across insert/normal transitions", () => {
  const editor = createEditor();
  assertEditor(editor, {
    text: "",
    cursor: { line: 0, col: 0 },
    mode: "insert",
  });

  play(editor, ["a", "b", "c", ESC]);
  assertEditor(editor, {
    text: "abc",
    cursor: { line: 0, col: 2 },
    mode: "normal",
  });

  editor.handleInput(ESC);
  assertEditor(editor, {
    text: "abc",
    cursor: { line: 0, col: 2 },
    mode: "normal",
  });

  editor.handleInput("i");
  assertEditor(editor, {
    text: "abc",
    cursor: { line: 0, col: 2 },
    mode: "insert",
  });
});

test("VimPiEditor applies Normal-mode cursor navigation", () => {
  for (const spec of [
    {
      name: "h/l stay within current line",
      text: "abc",
      keys: [ESC, "h", "h", "h", "l"],
      cursor: { line: 0, col: 1 },
    },
    {
      name: "0/$ move to line bounds",
      text: "abc",
      keys: [ESC, "0", "$"],
      cursor: { line: 0, col: 2 },
    },
    {
      name: "^/_ move to first non-blank",
      text: "  abc",
      keys: [ESC, "^", "0", "_"],
      cursor: { line: 0, col: 2 },
    },
    {
      name: "j/k preserve column where possible",
      text: "hello\nworld",
      keys: [ESC, "0", "l", "l", "l", "k", "j"],
      cursor: { line: 1, col: 3 },
    },
    {
      name: "k stays at top line",
      text: "hello\nworld",
      keys: [ESC, "k", "k"],
      cursor: { line: 0, col: 4 },
    },
    {
      name: "j stays at bottom line",
      text: "hello\nworld",
      keys: [ESC, "j"],
      cursor: { line: 1, col: 4 },
    },
    {
      name: "j/k clamp onto short lines",
      text: "x\nhello",
      keys: [ESC, "k"],
      cursor: { line: 0, col: 0 },
    },
    {
      name: "horizontal motion does not cross lines",
      text: "ab\ncd",
      keys: [ESC, "l", "0", "h", "k", "l", "l"],
      cursor: { line: 0, col: 1 },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(editor, { cursor: spec.cursor, mode: "normal" }, spec.name);
  }
});

test("VimPiEditor applies Normal-mode word motions", () => {
  for (const spec of [
    {
      name: "w traverses runs and lines",
      text: "foo  bar.baz\n  qux",
      keys: [ESC, "k", "0", "w", "w", "w", "w"],
      cursor: { line: 1, col: 2 },
    },
    {
      name: "b traverses runs and lines backward",
      text: "foo  bar.baz\n  qux",
      keys: [ESC, "b", "b", "b", "b", "b"],
      cursor: { line: 0, col: 0 },
    },
    {
      name: "e traverses run ends and lines",
      text: "foo  bar.baz\n  qux",
      keys: [ESC, "k", "0", "e", "e", "e", "e", "e"],
      cursor: { line: 1, col: 4 },
    },
    {
      name: "w advances across consecutive lines",
      text: "ok\nhello\nworld",
      keys: [ESC, "k", "k", "0", "w", "w"],
      cursor: { line: 2, col: 0 },
    },
    {
      name: "w skips spaces",
      text: "foo   bar",
      keys: [ESC, "0", "w"],
      cursor: { line: 0, col: 6 },
    },
    {
      name: "w advances to the next plain word",
      text: "foo bar",
      keys: [ESC, "0", "w"],
      cursor: { line: 0, col: 4 },
    },
    {
      name: "w advances from punctuation to the next word",
      text: "foo-bar",
      keys: [ESC, "0", "l", "l", "l", "w"],
      cursor: { line: 0, col: 4 },
    },
    {
      name: "e ends current word",
      text: "foobar",
      keys: [ESC, "0", "e"],
      cursor: { line: 0, col: 5 },
    },
    {
      name: "e advances from inside a word to the next word end",
      text: "foo bar",
      keys: [ESC, "0", "l", "l", "e"],
      cursor: { line: 0, col: 6 },
    },
    {
      name: "b from inside word",
      text: "foo bar",
      keys: [ESC, "0", "l", "l", "l", "l", "l", "b"],
      cursor: { line: 0, col: 4 },
    },
    {
      name: "b from word start goes to previous word",
      text: "foo bar",
      keys: [ESC, "0", "l", "l", "l", "l", "b"],
      cursor: { line: 0, col: 0 },
    },
    {
      name: "b skips wider whitespace",
      text: "foo   bar",
      keys: [ESC, "0", "l", "l", "l", "l", "l", "l", "b"],
      cursor: { line: 0, col: 0 },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(editor, { cursor: spec.cursor, mode: "normal" }, spec.name);
  }
});

test("VimPiEditor repeats a counted Normal-mode command", () => {
  const editor = createEditorWithText("abcdef");

  play(editor, [ESC, "0", "3", "l"]);

  assertEditor(editor, {
    text: "abcdef",
    cursor: { line: 0, col: 3 },
    mode: "normal",
  });
});

test("VimPiEditor applies Normal-mode count edge cases", () => {
  for (const spec of [
    {
      name: "count repeats word motion",
      text: "one two three",
      keys: [ESC, "0", "2", "w"],
      textAfter: "one two three",
      cursor: { line: 0, col: 8 },
    },
    {
      name: "0 extends an active count",
      text: "abcdefghijkl",
      keys: [ESC, "0", "1", "0", "l"],
      textAfter: "abcdefghijkl",
      cursor: { line: 0, col: 10 },
    },
    {
      name: "count resets after a command",
      text: "abcdef",
      keys: [ESC, "0", "2", "l", "l"],
      textAfter: "abcdef",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "unmapped keys clear pending count",
      text: "abcdef",
      keys: [ESC, "0", "2", "q", "l"],
      textAfter: "abcdef",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "count repeats delete-under-cursor",
      text: "abcde",
      keys: [ESC, "0", "3", "x"],
      textAfter: "de",
      cursor: { line: 0, col: 0 },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(
      editor,
      { text: spec.textAfter, cursor: spec.cursor, mode: "normal" },
      spec.name,
    );
  }
});

test("VimPiEditor applies delete operator motions", () => {
  for (const spec of [
    {
      name: "dl deletes under cursor",
      text: "abc",
      keys: [ESC, "0", "d", "l"],
      textAfter: "bc",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "dh deletes before cursor",
      text: "abc",
      keys: [ESC, "0", "l", "l", "d", "h"],
      textAfter: "ac",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "3dh deletes three chars left",
      text: "abcdef",
      keys: [ESC, "0", "l", "l", "l", "3", "d", "h"],
      textAfter: "def",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "d3h deletes three chars left",
      text: "abcdef",
      keys: [ESC, "0", "l", "l", "l", "d", "3", "h"],
      textAfter: "def",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "2d3h deletes six chars left",
      text: "abcdefghi",
      keys: [ESC, "0", "l", "l", "l", "l", "l", "l", "2", "d", "3", "h"],
      textAfter: "ghi",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "dj deletes current and next line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "d", "j"],
      textAfter: "three",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "dk deletes previous and current line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "d", "k"],
      textAfter: "three",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "dw deletes to next word",
      text: "one two three",
      keys: [ESC, "0", "d", "w"],
      textAfter: "two three",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "2dw repeats delete-word",
      text: "one two three",
      keys: [ESC, "0", "2", "d", "w"],
      textAfter: "three",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "d$ deletes to line end",
      text: "one two",
      keys: [ESC, "0", "l", "l", "l", "l", "d", "$"],
      textAfter: "one ",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "D deletes to line end",
      text: "one two",
      keys: [ESC, "0", "l", "l", "l", "l", "D"],
      textAfter: "one ",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "dd deletes current line",
      text: "one\ntwo",
      keys: [ESC, "k", "d", "d"],
      textAfter: "two",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "escape cancels pending delete operator",
      text: "one two",
      keys: [ESC, "0", "d", ESC, "w"],
      textAfter: "one two",
      cursor: { line: 0, col: 4 },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(
      editor,
      { text: spec.textAfter, cursor: spec.cursor, mode: "normal" },
      spec.name,
    );
  }
});

test("VimPiEditor applies Normal-mode insert-entry commands", () => {
  for (const spec of [
    {
      name: "a appends after cursor",
      keys: ["a", "b", "c", ESC, "a", "X"],
      text: "abcX",
      cursor: { line: 0, col: 4 },
    },
    {
      name: "A appends at line end",
      keys: ["a", "b", "c", ESC, "h", "A", "X"],
      text: "abcX",
      cursor: { line: 0, col: 4 },
    },
    {
      name: "I inserts at first non-blank",
      initialText: "  abc",
      keys: [ESC, "I", "X"],
      text: "  Xabc",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "o opens line below",
      keys: ["a", "b", "c", ESC, "o", "X"],
      text: "abc\nX",
      cursor: { line: 1, col: 1 },
    },
    {
      name: "O opens line above",
      keys: ["a", "b", "c", ESC, "O", "X"],
      text: "X\nabc",
      cursor: { line: 0, col: 1 },
    },
  ] as const) {
    const editor = spec.initialText
      ? createEditorWithText(spec.initialText)
      : createEditor();
    play(editor, spec.keys);
    assertEditor(
      editor,
      {
        text: spec.text,
        cursor: spec.cursor,
        mode: "insert",
      },
      spec.name,
    );
  }
});

test("VimPiEditor applies replace commands", () => {
  const replaceEditor = createEditor();
  play(replaceEditor, ["a", "b", "c", ESC, "0", "R", "X", "Y"]);
  assertEditor(replaceEditor, {
    text: "XYc",
    cursor: { line: 0, col: 2 },
    mode: "replace",
  });
  assert.match(replaceEditor.render(40).at(-1) ?? "", /-- REPLACE --$/);

  replaceEditor.handleInput(ESC);
  assertEditor(replaceEditor, {
    text: "XYc",
    cursor: { line: 0, col: 1 },
    mode: "normal",
  });

  const replaceOnceEditor = createEditor();
  play(replaceOnceEditor, ["a", "b", "c", ESC, "0", "l", "r"]);
  assertEditor(replaceOnceEditor, {
    text: "abc",
    cursor: { line: 0, col: 1 },
    mode: "normal",
  });

  replaceOnceEditor.handleInput("X");
  assertEditor(replaceOnceEditor, {
    text: "aXc",
    cursor: { line: 0, col: 1 },
    mode: "normal",
  });
});

test("VimPiEditor applies Normal-mode character deletion", () => {
  for (const spec of [
    {
      name: "x deletes under cursor",
      keys: ["a", "b", "c", ESC, "h", "x"],
      text: "ac",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "x clamps after deleting last char",
      keys: ["a", "b", "c", ESC, "x"],
      text: "ab",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "X deletes before cursor",
      keys: ["a", "b", "c", ESC, "X"],
      text: "ac",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "X does nothing at line start",
      keys: ["a", "b", "c", ESC, "0", "X"],
      text: "abc",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "x/X do nothing on empty line",
      initialText: "",
      keys: [ESC, "x", "X"],
      text: "",
      cursor: { line: 0, col: 0 },
    },
  ] as const) {
    const editor =
      spec.initialText === undefined
        ? createEditor()
        : createEditorWithText(spec.initialText);
    play(editor, spec.keys);
    assertEditor(
      editor,
      {
        text: spec.text,
        cursor: spec.cursor,
        mode: "normal",
      },
      spec.name,
    );
  }
});

test("VimPiEditor delegates insert input and ignores unmapped normal printable keys", () => {
  const editor = createEditor();
  play(editor, ["a", "b", "c", ESC, "q", "y", "z", "i", "X"]);

  assertEditor(editor, {
    text: "abXc",
    cursor: { line: 0, col: 3 },
    mode: "insert",
  });
  assert.match(editor.render(40).at(-1) ?? "", /-- INSERT --$/);
});

test("VimPiEditor passes configured app shortcuts through in Normal mode", () => {
  let interrupted = false;
  let cleared = false;
  const editor = createEditor(
    [],
    (data, action) =>
      (action === "app.interrupt" && matchesKey(data, "escape")) ||
      (action === "app.clear" && matchesKey(data, "ctrl+c")),
  );
  editor.onEscape = () => {
    interrupted = true;
  };
  editor.onAction("app.clear", () => {
    cleared = true;
  });

  play(editor, [ESC, ESC, "\x1b[99;5u", "\x17"]);

  assert.equal(interrupted, true);
  assert.equal(cleared, true);
  assertEditor(editor, {
    text: "",
    cursor: { line: 0, col: 0 },
    mode: "normal",
  });
});

test("VimPiEditor uses hardware bar cursor in insert and fake block cursor in normal", () => {
  const writes: string[] = [];
  const editor = createEditor(writes);

  assert.deepEqual(writes, ["\x1b[6 q"]);

  play(editor, ["a", "b", "c"]);
  const insertRender = editor.render(40).join("\n");
  assert.doesNotMatch(insertRender, /│/);
  assert.doesNotMatch(insertRender, /\x1b\[7m/);

  editor.handleInput(ESC);
  assert.deepEqual(writes, ["\x1b[6 q", "\x1b[2 q"]);
  assert.match(editor.render(40).join("\n"), /\x1b\[7mc\x1b\[0m/);
});

function assertEditor(
  editor: VimPiEditor,
  expected: {
    text?: string;
    cursor?: { line: number; col: number };
    mode?: "insert" | "normal" | "replace";
  },
  message?: string,
): void {
  if (expected.text !== undefined) {
    assert.equal(editor.getText(), expected.text, message);
  }
  if (expected.cursor) {
    assert.deepEqual(editor.getCursor(), expected.cursor, message);
  }
  if (expected.mode) {
    assert.equal(getVimMode(editor.vimSnapshot), expected.mode, message);
  }
}

function play(editor: VimPiEditor, keys: readonly string[]): void {
  for (const key of keys) {
    editor.handleInput(key);
  }
}

function createEditorWithText(text: string): VimPiEditor {
  const editor = createEditor();
  editor.setText(text);
  return editor;
}

function createEditor(
  writes: string[] = [],
  matches: (data: string, action: string) => boolean = () => false,
): VimPiEditor {
  const fakeTui = {
    terminal: { rows: 24, write: (data: string) => writes.push(data) },
    requestRender: () => {},
    setShowHardwareCursor: () => {},
  };
  const fakeTheme = { borderColor: (value: string) => value, selectList: {} };
  const fakeKeybindings = { matches };
  return new VimPiEditor(
    fakeTui as never,
    fakeTheme as never,
    fakeKeybindings as never,
  );
}
