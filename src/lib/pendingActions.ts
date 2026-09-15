/*
  A short "you can still undo this" window before a write actually happens.

  The alternative — write immediately, then reverse it if the user hits Undo —
  needs a compensating write: delete the remark, restore the previous stage,
  and hope RLS permits both. Delaying instead means Undo has nothing to
  reverse. The action simply never happened.

  Kept separate from the component because everything that can go wrong here
  is timing: undo racing the commit, a second tap while one is pending, and a
  window still open when the view unmounts. Those are testable on their own
  and invisible in a browser.
*/

type Entry = { timer: ReturnType<typeof setTimeout>; run: () => void | Promise<void> };

export class PendingActions {
  private entries = new Map<string, Entry>();

  /**
   * Schedule `run` to happen after `ms` unless cancelled first.
   * A key already pending is left alone and this returns false, so a double
   * tap cannot queue the same action twice or restart its window.
   */
  schedule(key: string, run: () => void | Promise<void>, ms: number): boolean {
    if (this.entries.has(key)) return false;
    const timer = setTimeout(() => {
      // Remove BEFORE running: once the timer fires the action is committed,
      // and a cancel arriving afterwards must report that it was too late
      // rather than silently doing nothing while the caller thinks it undid
      // the write.
      this.entries.delete(key);
      void run();
    }, ms);
    this.entries.set(key, { timer, run });
    return true;
  }

  /** Cancel a pending action. Returns false if it already committed. */
  cancel(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.entries.delete(key);
    return true;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Run everything still pending, now. For unmount: losing the write because
   * someone navigated away mid-window would be exactly the silent data loss
   * the offline queue exists to prevent.
   */
  flushAll(): void {
    const pending = [...this.entries.values()];
    this.entries.clear();
    for (const { timer, run } of pending) {
      clearTimeout(timer);
      void run();
    }
  }

  /** Drop everything without running it. For tests and teardown. */
  clear(): void {
    for (const { timer } of this.entries.values()) clearTimeout(timer);
    this.entries.clear();
  }
}
