// Repository snapshots contain plain objects, arrays and scalar values.
// Compare all fields (including nested comments/versions), not just ids or
// timestamps, so a same-id edit or a permissions change still reaches the UI.
export function sameSnapshot(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameSnapshot(value, right[index]));
  }
  if (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype) return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameSnapshot(a[key], b[key]));
}

export function retainSnapshot<T>(previous: T, next: T): T {
  return sameSnapshot(previous, next) ? previous : next;
}

// Share only overlapping requests. Settled results and errors are not cached,
// so reopening a screen or retrying still reads fresh server data.
export function shareInFlight<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (!pending) {
      pending = Promise.resolve().then(load).finally(() => { pending = undefined; });
    }
    return pending;
  };
}
