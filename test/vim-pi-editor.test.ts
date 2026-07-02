import assert from "node:assert/strict";
import test from "node:test";

import { VimPiEditor } from "../src/adapters/pi/editor.js";

function makeEditor(): VimPiEditor {
  return new VimPiEditor(
    {
      terminal: { rows: 24, write() {} },
      requestRender() {},
      setShowHardwareCursor() {},
    } as never,
    { borderColor: (value: string) => value } as never,
    { matches: () => false } as never,
  );
}

test("VimPiEditor treats plain Enter in insert mode as a newline", () => {
  const editor = makeEditor();
  let submitted: string | undefined;
  editor.onSubmit = (value) => {
    submitted = value;
  };

  editor.handleInput("i");
  editor.handleInput("a");
  editor.handleInput("\r");

  assert.equal(submitted, undefined);
  assert.equal(editor.getText(), "ia\n");
});
