import { decodeKittyPrintable, parseKey } from "@earendil-works/pi-tui";

import type { VimEvent } from "../../vim/events.js";

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

/**
 * Check whether a given string represents a one-byte ASCII control input
 * such as Ctrl+C or Ctrl+D.
 */
export function isSingleControlPiInput(data: string): boolean {
  return data.length === 1 && data.charCodeAt(0) < 32;
}
