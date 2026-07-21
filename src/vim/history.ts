/** Linear undo/redo history with bounded snapshot stacks. */
export class LinearHistory<Snapshot> {
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];

  constructor(private readonly maxSnapshots = 100) {}

  /** Remove all undo and redo snapshots. */
  reset(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  /** Record a new edit boundary and discard any abandoned redo path. */
  commit(snapshot: Snapshot): void {
    this.pushBounded(this.undoStack, snapshot);
    this.redoStack.length = 0;
  }

  /** Return the previous snapshot and move the current state onto redo. */
  undo(current: Snapshot): Snapshot | undefined {
    const snapshot = this.undoStack.pop();
    if (!snapshot) {
      return undefined;
    }
    this.pushBounded(this.redoStack, current);
    return snapshot;
  }

  /** Return the next snapshot and move the current state back onto undo. */
  redo(current: Snapshot): Snapshot | undefined {
    const snapshot = this.redoStack.pop();
    if (!snapshot) {
      return undefined;
    }
    this.pushBounded(this.undoStack, current);
    return snapshot;
  }

  /** Push a snapshot and discard the oldest entry if the stack is full. */
  private pushBounded(stack: Snapshot[], snapshot: Snapshot): void {
    stack.push(structuredClone(snapshot));
    if (stack.length > this.maxSnapshots) {
      stack.shift();
    }
  }
}
