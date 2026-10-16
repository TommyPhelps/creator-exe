// Undo/redo stack for immutable documents.
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private readonly limit: number;
  present: T;

  constructor(initial: T, limit = 200) {
    this.present = initial;
    this.limit = limit;
  }

  /** Records a new state. Identical consecutive states are ignored. */
  push(next: T): void {
    if (next === this.present) return;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.present = next;
    this.future = [];
  }

  /** Replaces the present without creating an undo step (e.g. during a drag). */
  replace(next: T): void {
    this.present = next;
  }

  undo(): T {
    const prev = this.past.pop();
    if (prev !== undefined) {
      this.future.push(this.present);
      this.present = prev;
    }
    return this.present;
  }

  redo(): T {
    const next = this.future.pop();
    if (next !== undefined) {
      this.past.push(this.present);
      this.present = next;
    }
    return this.present;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  reset(state: T): void {
    this.past = [];
    this.future = [];
    this.present = state;
  }
}

/** Snaps a value to the grid and to any of the given guide positions within `threshold`. */
export function snap(value: number, guides: number[], grid: number | null, threshold = 8): { value: number; guide: number | null } {
  let best: { value: number; guide: number | null; d: number } = { value, guide: null, d: threshold + 1 };
  for (const g of guides) {
    const d = Math.abs(value - g);
    if (d <= threshold && d < best.d) best = { value: g, guide: g, d };
  }
  if (best.guide !== null) return { value: best.value, guide: best.guide };
  if (grid && grid > 0) return { value: Math.round(value / grid) * grid, guide: null };
  return { value, guide: null };
}
