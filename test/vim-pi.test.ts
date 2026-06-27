import assert from "node:assert/strict";
import test from "node:test";

import vimPiExtension, { VimPiEditor } from "../src/index.js";
import { applyVimActionToPiEditor } from "../src/adapters/pi/apply-action.js";
import { matchesKey } from "@earendil-works/pi-tui";

import { normalizePiKey } from "../src/adapters/pi/keymap.js";
import { getVimMode } from "../src/vim/selectors.js";
import {
  getInitialVimSnapshot,
  transitionVim,
  type VimSnapshot,
} from "../src/vim/transition.js";

test("Vim core switches between insert and normal", () => {
  let result = getInitialVimSnapshot();
  assert.equal(getVimMode(result.snapshot), "insert");
  assert.deepEqual(result.actions, []);

  result = transitionVim(result.snapshot, { type: "KEY", key: "escape" });
  assert.equal(getVimMode(result.snapshot), "normal");
  assert.deepEqual(result.actions, [
    { type: "placeCursorOnPreviousCharacter" },
  ]);

  const snapshotBeforeNoop: VimSnapshot = result.snapshot;
  result = transitionVim(result.snapshot, { type: "KEY", key: "escape" });
  assert.equal(result.snapshot.value, snapshotBeforeNoop.value);
  assert.deepEqual(result.actions, []);

  result = transitionVim(result.snapshot, { type: "KEY", key: "i" });
  assert.equal(getVimMode(result.snapshot), "insert");
  assert.deepEqual(result.actions, [{ type: "placeCaretBeforeCursor" }]);
});

test("Vim core emits Normal-mode hjkl cursor actions", () => {
  let result = getInitialVimSnapshot();
  result = transitionVim(result.snapshot, { type: "KEY", key: "escape" });

  for (const [key, action] of [
    ["h", "moveCursorLeft"],
    ["j", "moveCursorDown"],
    ["k", "moveCursorUp"],
    ["l", "moveCursorRight"],
  ] as const) {
    result = transitionVim(result.snapshot, { type: "KEY", key });
    assert.equal(getVimMode(result.snapshot), "normal");
    assert.deepEqual(result.actions, [{ type: action }]);
  }
});

test("Pi keymap normalizes raw input into Vim keys", () => {
  assert.equal(normalizePiKey("\x1b"), "escape");
  assert.equal(normalizePiKey("i"), "i");
  assert.equal(normalizePiKey("\x1b[99;5u"), "ctrl+c");
});

test("Pi cursor actions apply initial Vim cursor rules", () => {
  const cursorTarget = (col: number) => ({
    getCursor: () => ({ line: 0, col }),
    moveCaretLeft: () => {
      col -= 1;
    },
    moveCaretDown: () => {},
    moveCaretUp: () => {},
    moveCaretRight: () => {
      col += 1;
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

  applyVimActionToPiEditor({ type: "moveCursorRight" }, target);
  assert.equal(target.getCursor().col, 2);
  applyVimActionToPiEditor({ type: "moveCursorLeft" }, target);
  assert.equal(target.getCursor().col, 1);
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

test("VimPiEditor applies Normal-mode hjkl navigation", () => {
  const editor = createEditor();

  for (const key of ["a", "b", "c", "\x1b", "l"]) editor.handleInput(key);
  assert.deepEqual(editor.getCursor(), { line: 0, col: 2 });

  for (const key of ["h", "h", "h", "l"]) editor.handleInput(key);
  assert.deepEqual(editor.getCursor(), { line: 0, col: 1 });

  const verticalEditor = createEditor();
  verticalEditor.setText("ab\ncd");
  verticalEditor.handleInput("\x1b");
  assert.deepEqual(verticalEditor.getCursor(), { line: 1, col: 1 });
  verticalEditor.handleInput("k");
  assert.deepEqual(verticalEditor.getCursor(), { line: 0, col: 1 });
  verticalEditor.handleInput("j");
  assert.deepEqual(verticalEditor.getCursor(), { line: 1, col: 1 });

  const shortLineEditor = createEditor();
  shortLineEditor.setText("x\nhello");
  shortLineEditor.handleInput("\x1b");
  assert.deepEqual(shortLineEditor.getCursor(), { line: 1, col: 4 });
  shortLineEditor.handleInput("k");
  assert.deepEqual(shortLineEditor.getCursor(), { line: 0, col: 0 });
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

  editor.handleInput("\x1b");
  editor.handleInput("\x1b");
  editor.handleInput("\x1b[99;5u");
  editor.handleInput("\x17");

  assert.equal(interrupted, true);
  assert.equal(cleared, true);
  assert.equal(editor.getText(), "");
});

test("VimPiEditor delegates insert input and ignores normal printable keys", () => {
  const editor = createEditor();

  for (const key of ["a", "b", "c", "\x1b", "x", "y", "z", "i", "X"])
    editor.handleInput(key);

  assert.equal(editor.getText(), "abXc");
  assert.deepEqual(editor.getCursor(), { line: 0, col: 3 });
  assert.equal(getVimMode(editor.getVimSnapshot()), "insert");
  assert.match(editor.render(40).at(-1) ?? "", /-- INSERT --$/);
});

test("VimPiEditor uses hardware bar cursor in insert and fake block cursor in normal", () => {
  const writes: string[] = [];
  const editor = createEditor(writes);

  assert.deepEqual(writes, ["\x1b[6 q"]);

  for (const key of ["a", "b", "c"]) editor.handleInput(key);
  const insertRender = editor.render(40).join("\n");
  assert.doesNotMatch(insertRender, /│/);
  assert.doesNotMatch(insertRender, /\x1b\[7m/);

  editor.handleInput("\x1b");
  assert.deepEqual(writes, ["\x1b[6 q", "\x1b[2 q"]);
  assert.match(editor.render(40).join("\n"), /\x1b\[7mc\x1b\[0m/);
});

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
