import type { VimMode } from "./state.js";
import type { VimSnapshot } from "./machine.js";

export type VimModeLabel = "-- INSERT --" | "-- NORMAL --" | "-- REPLACE --";

export function getVimMode(snapshot: VimSnapshot): VimMode {
  switch (snapshot.value) {
    case "insert":
      return "insert";
    case "normal":
      return "normal";
    case "replace":
      return "replace";
    default:
      throw new Error(
        `Unknown Vim machine state: ${JSON.stringify(snapshot.value)}`,
      );
  }
}

export function getVimModeLabel(snapshot: VimSnapshot): VimModeLabel {
  switch (getVimMode(snapshot)) {
    case "insert":
      return "-- INSERT --";
    case "normal":
      return "-- NORMAL --";
    case "replace":
      return "-- REPLACE --";
  }
}
