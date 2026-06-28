import type { VimMode } from "./state.js";
import type { VimSnapshot } from "./machine.js";

/** Rendered status labels shown by the Pi adapter. */
export type VimModeLabel =
  | "-- INSERT --"
  | "-- NORMAL --"
  | "-- OPERATOR --"
  | "-- REPLACE --";

export function getVimMode(snapshot: VimSnapshot): VimMode {
  switch (snapshot.value) {
    case "insert":
      return "insert";
    case "normal":
    case "find-forward":
    case "find-backward":
    case "till-forward":
    case "till-backward":
    case "g-prefix":
    case "operator-find-forward":
    case "operator-find-backward":
    case "operator-till-forward":
    case "operator-till-backward":
    case "operator-pending":
    case "replace-once":
      return "normal";
    case "replace":
      return "replace";
    default:
      throw new Error(
        `Unknown Vim machine state: ${JSON.stringify(snapshot.value)}`,
      );
  }
}

/** Return the user-visible mode label, including parser substates worth showing. */
export function getVimModeLabel(snapshot: VimSnapshot): VimModeLabel {
  if (
    snapshot.value === "operator-pending" ||
    snapshot.value === "operator-find-forward" ||
    snapshot.value === "operator-find-backward" ||
    snapshot.value === "operator-till-forward" ||
    snapshot.value === "operator-till-backward"
  ) {
    return "-- OPERATOR --";
  }

  switch (getVimMode(snapshot)) {
    case "insert":
      return "-- INSERT --";
    case "normal":
      return "-- NORMAL --";
    case "replace":
      return "-- REPLACE --";
  }
}
