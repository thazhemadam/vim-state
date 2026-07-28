import { decodeKittyPrintable, parseKey } from "@earendil-works/pi-tui";

import type { VimEvent } from "vim-state";

export function piInputToVimEvent(data: string): VimEvent {
  return { type: "KEY", key: normalizePiKey(data) };
}

export function normalizePiKey(data: string): string {
  return decodeKittyPrintable(data) ?? parseKey(data) ?? data;
}

export function isPrintablePiInput(data: string): boolean {
  return (
    decodeKittyPrintable(data) !== undefined ||
    (data.length === 1 &&
      data.charCodeAt(0) >= 32 &&
      data.charCodeAt(0) !== 127)
  );
}
