import type { VimMode } from "./state.js";
import type { VimSnapshot } from "./transition.js";

export type VimModeLabel = "-- INSERT --" | "-- NORMAL --";

export function getVimMode(snapshot: VimSnapshot): VimMode {
  switch (snapshot.value) {
    case "insert":
      return "insert";
    case "normal":
      return "normal";
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
  }
}
