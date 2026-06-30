import assert from "node:assert/strict";
import test from "node:test";

import vimPiExtension, { VimPiEditor } from "../src/index.js";
import { matchesKey } from "@earendil-works/pi-tui";

import { normalizePiKey } from "../src/adapters/pi/keymap.js";
import { getVimMode, getVimModeLabel } from "../src/vim/selectors.js";

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
    {
      name: "G moves to the last line first non-blank",
      text: "one\ntwo\n  three",
      keys: [ESC, "k", "k", "G"],
      cursor: { line: 2, col: 2 },
    },
    {
      name: "gg moves to the first line first non-blank",
      text: "  one\ntwo\nthree",
      keys: [ESC, "g", "g"],
      cursor: { line: 0, col: 2 },
    },
    {
      name: "counted G moves to the counted line",
      text: "one\n  two\nthree",
      keys: [ESC, "1", "G"],
      cursor: { line: 0, col: 0 },
    },
    {
      name: "counted gg moves to the counted line",
      text: "one\n  two\nthree",
      keys: [ESC, "2", "g", "g"],
      cursor: { line: 1, col: 2 },
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
    {
      name: "W treats punctuation as part of a WORD",
      text: "foo-bar baz",
      keys: [ESC, "0", "W"],
      cursor: { line: 0, col: 8 },
    },
    {
      name: "B treats punctuation as part of a WORD",
      text: "foo-bar baz",
      keys: [ESC, "0", "W", "B"],
      cursor: { line: 0, col: 0 },
    },
    {
      name: "E treats punctuation as part of a WORD",
      text: "foo-bar baz",
      keys: [ESC, "0", "E"],
      cursor: { line: 0, col: 6 },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(editor, { cursor: spec.cursor, mode: "normal" }, spec.name);
  }
});

test("VimPiEditor applies Normal-mode find and till motions", () => {
  for (const spec of [
    {
      name: "f moves forward to the target character",
      text: "abacad",
      keys: [ESC, "0", "f", "c"],
      cursor: { line: 0, col: 3 },
    },
    {
      name: "counted f moves to the counted target character",
      text: "abacad",
      keys: [ESC, "0", "2", "f", "a"],
      cursor: { line: 0, col: 4 },
    },
    {
      name: "F moves backward to the target character",
      text: "abacad",
      keys: [ESC, "$", "F", "a"],
      cursor: { line: 0, col: 4 },
    },
    {
      name: "t moves forward until before the target character",
      text: "abacad",
      keys: [ESC, "0", "t", "c"],
      cursor: { line: 0, col: 2 },
    },
    {
      name: "T moves backward until after the target character",
      text: "abacad",
      keys: [ESC, "$", "T", "a"],
      cursor: { line: 0, col: 5 },
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
      cursor: { line: 0, col: 2 },
    },
    {
      name: "dk deletes previous and current line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "d", "k"],
      textAfter: "three",
      cursor: { line: 0, col: 2 },
    },
    {
      name: "dw deletes to next word",
      text: "one two three",
      keys: [ESC, "0", "d", "w"],
      textAfter: "two three",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "dW deletes to next WORD",
      text: "foo-bar baz",
      keys: [ESC, "0", "d", "W"],
      textAfter: "baz",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "df deletes through the target character",
      text: "abacad",
      keys: [ESC, "0", "d", "f", "c"],
      textAfter: "ad",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "dt deletes until before the target character",
      text: "abacad",
      keys: [ESC, "0", "d", "t", "c"],
      textAfter: "cad",
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
      name: "2dj deletes current and two following lines once",
      text: "one\ntwo\nthree\nfour",
      keys: [ESC, "k", "k", "k", "2", "d", "j"],
      textAfter: "four",
      cursor: { line: 0, col: 2 },
    },
    {
      name: "d2$ deletes through the next line end once",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "0", "d", "2", "$"],
      textAfter: "\nthree",
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
      name: "d$ deletes the final character",
      text: "text1",
      keys: [ESC, "$", "d", "$"],
      textAfter: "text",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "D deletes the final character",
      text: "text1",
      keys: [ESC, "$", "D"],
      textAfter: "text",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "de does nothing at the end of the final word",
      text: "text1",
      keys: [ESC, "$", "d", "e"],
      textAfter: "text1",
      cursor: { line: 0, col: 4 },
    },
    {
      name: "dd deletes current line",
      text: "one\ntwo",
      keys: [ESC, "k", "d", "d"],
      textAfter: "two",
      cursor: { line: 0, col: 2 },
    },
    {
      name: "dd on first line clamps to a shorter following line",
      text: "hello\nhi\ntail",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "d", "d"],
      textAfter: "hi\ntail",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "dd on first line preserves column on a long enough following line",
      text: "hello\nlonger\ntail",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "d", "d"],
      textAfter: "longer\ntail",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "2dd preserves column on a long enough surviving line",
      text: "hello\nworld\nlonger",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "2", "d", "d"],
      textAfter: "longer",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "2dd clamps column on a shorter surviving line",
      text: "hello\nworld\nhi",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "2", "d", "d"],
      textAfter: "hi",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "dd on middle line clamps to a shorter following line",
      text: "top\nhello\nhi\ntail",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "d", "d"],
      textAfter: "top\nhi\ntail",
      cursor: { line: 1, col: 1 },
    },
    {
      name: "dd on middle line preserves column on a long enough following line",
      text: "top\nhello\nlonger\ntail",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "d", "d"],
      textAfter: "top\nlonger\ntail",
      cursor: { line: 1, col: 3 },
    },
    {
      name: "dd on last line clamps to a shorter previous line",
      text: "hi\nhello",
      keys: [ESC, "0", "l", "l", "l", "d", "d"],
      textAfter: "hi",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "dd on last line preserves column on a long enough previous line",
      text: "longer\nhello",
      keys: [ESC, "0", "l", "l", "l", "d", "d"],
      textAfter: "longer",
      cursor: { line: 0, col: 3 },
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

test("VimPiEditor stores deleted text in the unnamed register", () => {
  for (const spec of [
    {
      name: "x stores a charwise register",
      text: "abc",
      keys: [ESC, "0", "x"],
      register: { text: "a", type: "charwise" },
    },
    {
      name: "X stores the deleted character in buffer order",
      text: "abc",
      keys: [ESC, "0", "l", "X"],
      register: { text: "a", type: "charwise" },
    },
    {
      name: "dw stores a charwise register",
      text: "one two",
      keys: [ESC, "0", "d", "w"],
      register: { text: "one ", type: "charwise" },
    },
    {
      name: "dd stores a linewise register",
      text: "one\ntwo",
      keys: [ESC, "k", "d", "d"],
      register: { text: "one\n", type: "linewise" },
    },
    {
      name: "2dw stores the full repeated delete",
      text: "one two three",
      keys: [ESC, "0", "2", "d", "w"],
      register: { text: "one two ", type: "charwise" },
    },
    {
      name: "3dh stores backward deletes in buffer order",
      text: "abcdef",
      keys: [ESC, "0", "l", "l", "l", "3", "d", "h"],
      register: { text: "abc", type: "charwise" },
    },
    {
      name: "replace mode delete does not update the register",
      text: "abc",
      keys: [ESC, "0", "x", "R", "Z"],
      register: { text: "a", type: "charwise" },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertRegister(editor, spec.register, spec.name);
  }
});

test("VimPiEditor stores yanked text in the unnamed register", () => {
  for (const spec of [
    {
      name: "yw stores a charwise register without deleting text",
      text: "one two",
      keys: [ESC, "0", "y", "w"],
      textAfter: "one two",
      cursor: { line: 0, col: 0 },
      register: { text: "one ", type: "charwise" },
    },
    {
      name: "yy stores a linewise register",
      text: "one\ntwo",
      keys: [ESC, "k", "y", "y"],
      textAfter: "one\ntwo",
      cursor: { line: 0, col: 2 },
      register: { text: "one\n", type: "linewise" },
    },
    {
      name: "2yw stores the full counted range",
      text: "one two three",
      keys: [ESC, "0", "2", "y", "w"],
      textAfter: "one two three",
      cursor: { line: 0, col: 0 },
      register: { text: "one two ", type: "charwise" },
    },
    {
      name: "yE stores through the end of a WORD",
      text: "foo-bar baz",
      keys: [ESC, "0", "y", "E"],
      textAfter: "foo-bar baz",
      cursor: { line: 0, col: 0 },
      register: { text: "foo-bar", type: "charwise" },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(
      editor,
      { text: spec.textAfter, cursor: spec.cursor, mode: "normal" },
      spec.name,
    );
    assertRegister(editor, spec.register, spec.name);
  }
});

test("VimPiEditor puts unnamed register text", () => {
  for (const spec of [
    {
      name: "p with no register does nothing",
      text: "abc",
      keys: [ESC, "0", "p"],
      textAfter: "abc",
      mode: "normal",
    },
    {
      name: "P with no register does nothing",
      text: "abc",
      keys: [ESC, "0", "P"],
      textAfter: "abc",
      mode: "normal",
    },
    {
      name: "p puts charwise text after cursor",
      text: "abc",
      keys: [ESC, "0", "l", "x", "p"],
      textAfter: "acb",
      mode: "normal",
    },
    {
      name: "P puts charwise text before cursor",
      text: "abc",
      keys: [ESC, "0", "l", "x", "P"],
      textAfter: "abc",
      mode: "normal",
    },
    {
      name: "p puts linewise text below current line",
      text: "one\ntwo",
      keys: [ESC, "k", "d", "d", "p"],
      textAfter: "two\none",
      mode: "normal",
    },
    {
      name: "P puts linewise text above current line",
      text: "one\ntwo",
      keys: [ESC, "k", "d", "d", "P"],
      textAfter: "one\ntwo",
      mode: "normal",
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(editor, { text: spec.textAfter, mode: spec.mode }, spec.name);
  }
});

test("VimPiEditor stores changed text in the unnamed register", () => {
  for (const spec of [
    {
      name: "cw stores changed text",
      text: "one two",
      keys: [ESC, "0", "c", "w"],
      register: { text: "one ", type: "charwise" },
    },
    {
      name: "cc stores changed line",
      text: "one\ntwo",
      keys: [ESC, "k", "c", "c"],
      register: { text: "one\n", type: "linewise" },
    },
    {
      name: "2cc stores both changed lines",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "2", "c", "c"],
      register: { text: "one\ntwo\n", type: "linewise" },
    },
    {
      name: "C stores text changed to line end",
      text: "one two",
      keys: [ESC, "0", "l", "l", "l", "C"],
      register: { text: " two", type: "charwise" },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertRegister(editor, spec.register, spec.name);
  }
});

test("VimPiEditor applies change operator motions", () => {
  for (const spec of [
    {
      name: "cl deletes under cursor and enters insert",
      text: "abc",
      keys: [ESC, "0", "c", "l", "X"],
      textAfter: "Xbc",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "ch deletes before cursor and enters insert",
      text: "abc",
      keys: [ESC, "0", "l", "l", "c", "h", "X"],
      textAfter: "aXc",
      cursor: { line: 0, col: 2 },
    },
    {
      name: "cj changes current and next line into one insert line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "c", "j", "X"],
      textAfter: "X\nthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "ck changes previous and current line into one insert line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "c", "k", "X"],
      textAfter: "X\nthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "cw deletes to next word and enters insert",
      text: "one two three",
      keys: [ESC, "0", "c", "w", "X"],
      textAfter: "Xtwo three",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "ct changes until before the target character and enters insert",
      text: "abacad",
      keys: [ESC, "0", "c", "t", "c", "X"],
      textAfter: "Xcad",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "2cw repeats change-word and enters insert",
      text: "one two three",
      keys: [ESC, "0", "2", "c", "w", "X"],
      textAfter: "Xthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "c2w changes two words and enters insert",
      text: "one two three",
      keys: [ESC, "0", "c", "2", "w", "X"],
      textAfter: "Xthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "2c2w multiplies operator and motion counts",
      text: "one two three four five",
      keys: [ESC, "0", "2", "c", "2", "w", "X"],
      textAfter: "Xfive",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "c2$ changes through the next line end once",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "0", "c", "2", "$", "X"],
      textAfter: "X\nthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "cc changes current line and enters insert",
      text: "one\ntwo",
      keys: [ESC, "k", "c", "c", "X"],
      textAfter: "X\ntwo",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "cc leaves an empty first line",
      text: "hello\nworld\ntail",
      keys: [ESC, "k", "k", "0", "l", "l", "l", "c", "c"],
      textAfter: "\nworld\ntail",
      cursor: { line: 0, col: 0 },
    },
    {
      name: "cc leaves an empty line when changing a middle line",
      text: "hello\nworld\ntext",
      keys: [ESC, "k", "0", "l", "l", "l", "c", "c"],
      textAfter: "hello\n\ntext",
      cursor: { line: 1, col: 0 },
    },
    {
      name: "cc leaves an empty last line",
      text: "world\nhello",
      keys: [ESC, "0", "l", "l", "l", "c", "c"],
      textAfter: "world\n",
      cursor: { line: 1, col: 0 },
    },
    {
      name: "2cc changes two lines into one insert line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "2", "c", "c", "X"],
      textAfter: "X\nthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "c2c changes two lines into one insert line",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "c", "2", "c", "X"],
      textAfter: "X\nthree",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "c$ deletes to line end and enters insert",
      text: "one two",
      keys: [ESC, "0", "l", "l", "l", "c", "$", "X"],
      textAfter: "oneX",
      cursor: { line: 0, col: 4 },
    },
    {
      name: "c$ changes the final character from insert position",
      text: "text1",
      keys: [ESC, "$", "c", "$", "X"],
      textAfter: "textX",
      cursor: { line: 0, col: 5 },
    },
    {
      name: "C changes the final character from insert position",
      text: "text1",
      keys: [ESC, "$", "C", "X"],
      textAfter: "textX",
      cursor: { line: 0, col: 5 },
    },
    {
      name: "ce enters insert at the end of the final word without deleting",
      text: "text1",
      keys: [ESC, "$", "c", "e"],
      textAfter: "text1",
      cursor: { line: 0, col: 4 },
      mode: "insert",
    },
    {
      name: "C deletes to line end and enters insert",
      text: "one two",
      keys: [ESC, "0", "l", "l", "l", "C", "X"],
      textAfter: "oneX",
      cursor: { line: 0, col: 4 },
    },
  ] as const) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(
      editor,
      {
        text: spec.textAfter,
        cursor: spec.cursor,
        mode: spec.mode ?? "insert",
      },
      spec.name,
    );
  }
});

test("VimPiEditor cancels a pending change operator", () => {
  const editor = createEditorWithText("one two");

  play(editor, [ESC, "0", "c", ESC, "w"]);

  assertEditor(editor, {
    text: "one two",
    cursor: { line: 0, col: 4 },
    mode: "normal",
  });
});

test("VimPiEditor applies Visual-mode selections", () => {
  for (const spec of [
    {
      name: "v y yanks the selected chars",
      text: "abcdef",
      keys: [ESC, "0", "v", "l", "l", "y"],
      textAfter: "abcdef",
      cursor: { line: 0, col: 2 },
      register: { text: "abc", type: "charwise" as const },
      mode: "normal" as const,
    },
    {
      name: "v d deletes the selected chars",
      text: "abcdef",
      keys: [ESC, "0", "v", "l", "l", "d"],
      textAfter: "def",
      cursor: { line: 0, col: 0 },
      register: { text: "abc", type: "charwise" as const },
      mode: "normal" as const,
    },
    {
      name: "v x deletes the selected chars",
      text: "abcdef",
      keys: [ESC, "0", "v", "l", "l", "x"],
      textAfter: "def",
      cursor: { line: 0, col: 0 },
      register: { text: "abc", type: "charwise" as const },
      mode: "normal" as const,
    },
    {
      name: "v c changes the selected chars",
      text: "abcdef",
      keys: [ESC, "0", "v", "l", "l", "c"],
      textAfter: "def",
      cursor: { line: 0, col: 0 },
      register: { text: "abc", type: "charwise" as const },
      mode: "insert" as const,
    },
    {
      name: "V y yanks whole selected lines",
      text: "one\ntwo\nthree",
      keys: [ESC, "g", "g", "V", "j", "y"],
      textAfter: "one\ntwo\nthree",
      cursor: { line: 1, col: 0 },
      register: { text: "one\ntwo\n", type: "linewise" as const },
      mode: "normal" as const,
    },
  ]) {
    const editor = createEditorWithText(spec.text);
    play(editor, spec.keys);
    assertEditor(
      editor,
      { text: spec.textAfter, cursor: spec.cursor, mode: spec.mode },
      spec.name,
    );
    assertRegister(editor, spec.register, spec.name);
    assert.equal(editor.vimSnapshot.context.visual, undefined, spec.name);
  }
});

test("VimPiEditor replaces Visual selections with the unnamed register", () => {
  for (const spec of [
    { key: "p", name: "p replaces charwise selection" },
    { key: "P", name: "P replaces charwise selection" },
  ]) {
    const editor = createEditorWithText("cat dog");
    play(editor, [ESC, "0", "y", "w", "w", "v", "l", "l", spec.key]);
    assertEditor(
      editor,
      { text: "cat cat ", cursor: { line: 0, col: 7 }, mode: "normal" },
      spec.name,
    );
    assertRegister(editor, { text: "dog", type: "charwise" }, spec.name);
    assert.equal(editor.vimSnapshot.context.visual, undefined, spec.name);
  }
});

test("VimPiEditor exits Visual mode without changing the buffer", () => {
  const editor = createEditorWithText("abcdef");
  play(editor, [ESC, "0", "v", "l"]);
  assert.equal(getVimModeLabel(editor.vimSnapshot), "-- VISUAL --");

  editor.handleInput(ESC);
  assertEditor(editor, {
    text: "abcdef",
    cursor: { line: 0, col: 1 },
    mode: "normal",
  });
  assert.equal(editor.vimSnapshot.context.register, undefined);
  assert.equal(editor.vimSnapshot.context.visual, undefined);
});

test("VimPiEditor renders Visual mode labels", () => {
  const editor = createEditorWithText("one\ntwo");
  play(editor, [ESC, "g", "g", "v"]);
  assert.match(editor.render(40).at(-1) ?? "", /-- VISUAL --$/);

  editor.handleInput(ESC);
  editor.handleInput("V");
  assert.match(editor.render(40).at(-1) ?? "", /-- VISUAL LINE --$/);
});

test("VimPiEditor highlights Visual selections", () => {
  const charwise = createEditorWithText("abcdef");
  play(charwise, [ESC, "0", "v", "l", "l"]);
  assert.ok(charwise.render(40)[1]?.includes("\x1b[7mabc\x1b[0mdef"));

  const focused = createEditorWithText("hello\nbeautiful\nworld");
  focused.focused = true;
  play(focused, [ESC, "k", "k", "0", "l", "l", "v", "j", "j"]);
  assert.ok(focused.render(40)[3]?.includes("\x1b[0mld"));

  const linewise = createEditorWithText("one\ntwo\nthree");
  play(linewise, [ESC, "g", "g", "V", "j"]);
  const rendered = linewise.render(40);
  assert.ok(rendered[1]?.includes("\x1b[7mone\x1b[0m"));
  assert.ok(rendered[2]?.includes("\x1b[7mtwo\x1b[0m"));
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

  const registerEditor = createEditorWithText("abc def");
  play(registerEditor, [ESC, "0", "y", "w", "w", "r", "X"]);
  assertEditor(registerEditor, {
    text: "abc Xef",
    cursor: { line: 0, col: 4 },
    mode: "normal",
  });
  assertRegister(registerEditor, { text: "abc ", type: "charwise" });
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

test("VimPiEditor applies Normal-mode case toggle", () => {
  for (const spec of [
    {
      name: "~ toggles case under cursor and advances",
      text: "abC",
      keys: [ESC, "0", "~"],
      textAfter: "AbC",
      cursor: { line: 0, col: 1 },
    },
    {
      name: "counted ~ toggles multiple characters and clamps at line end",
      text: "a1Bc",
      keys: [ESC, "0", "4", "~"],
      textAfter: "A1bC",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "~ does nothing on empty line",
      text: "",
      keys: [ESC, "~"],
      textAfter: "",
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

test("VimPiEditor applies Normal-mode line join", () => {
  for (const spec of [
    {
      name: "J joins the next line with one space",
      text: "one\ntwo",
      keys: [ESC, "k", "J"],
      textAfter: "one two",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "J removes indentation from the joined line",
      text: "one\n  two",
      keys: [ESC, "k", "J"],
      textAfter: "one two",
      cursor: { line: 0, col: 3 },
    },
    {
      name: "counted J joins multiple following lines",
      text: "one\ntwo\nthree",
      keys: [ESC, "k", "k", "3", "J"],
      textAfter: "one two three",
      cursor: { line: 0, col: 7 },
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

test("VimPiEditor renders operator-pending mode label", () => {
  const editor = createEditor();
  play(editor, ["a", "b", "c", ESC, "d"]);
  assert.match(editor.render(40).at(-1) ?? "", /-- OPERATOR --$/);
});

test("VimPiEditor uses hardware cursors for insert, replace, and operator-pending", () => {
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

  editor.handleInput("R");
  assert.deepEqual(writes, ["\x1b[6 q", "\x1b[2 q", "\x1b[4 q"]);
  editor.handleInput(ESC);
  assert.deepEqual(writes, ["\x1b[6 q", "\x1b[2 q", "\x1b[4 q", "\x1b[2 q"]);
  editor.handleInput("r");
  assert.deepEqual(writes, [
    "\x1b[6 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
    "\x1b[4 q",
  ]);
  editor.handleInput(ESC);
  assert.deepEqual(writes, [
    "\x1b[6 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
  ]);

  editor.handleInput("d");
  assert.deepEqual(writes, [
    "\x1b[6 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
    "\x1b[4 q",
  ]);
  assert.doesNotMatch(editor.render(40).join("\n"), /\x1b\[7m/);

  editor.handleInput("f");
  assert.deepEqual(writes, [
    "\x1b[6 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
    "\x1b[4 q",
    "\x1b[2 q",
    "\x1b[4 q",
  ]);
  assert.match(editor.render(40).at(-1) ?? "", /-- OPERATOR --$/);
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

function assertRegister(
  editor: VimPiEditor,
  expected: { text: string; type: "charwise" | "linewise" },
  message?: string,
): void {
  assert.deepEqual(editor.vimSnapshot.context.register, expected, message);
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
