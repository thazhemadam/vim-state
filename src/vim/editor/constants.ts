/** Terminal/control key bytes forwarded to the host editor. */
export const ARROW_LEFT = "\x1b[D";
export const ARROW_DOWN = "\x1b[B";
export const ARROW_UP = "\x1b[A";
export const ARROW_RIGHT = "\x1b[C";
export const LINE_START = "\x01"; // Ctrl-A
export const LINE_END = "\x05"; // Ctrl-E
export const NEWLINE = "\n";
export const DELETE_FORWARD = "\x1b[3~"; // Delete
export const DELETE_BACKWARD = "\x7f"; // Backspace
