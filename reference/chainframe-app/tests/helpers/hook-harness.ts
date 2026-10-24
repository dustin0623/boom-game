/** Hook lifecycle harness for the project's Node-based interaction tests. */
export class HookHarness {
  private slots: unknown[] = [];
  private index = 0;
  private effects: Array<() => void> = [];
  private cleanups = new Map<number, () => void>();
  private dirty = false;

  useState = <T>(
    initial: T | (() => T),
  ): [T, (value: T | ((old: T) => T)) => void] => {
    const index = this.index++;
    if (!(index in this.slots))
      this.slots[index] =
        typeof initial === "function" ? (initial as () => T)() : initial;
    return [
      this.slots[index] as T,
      (value) => {
        const next =
          typeof value === "function"
            ? (value as (old: T) => T)(this.slots[index] as T)
            : value;
        if (!Object.is(next, this.slots[index])) {
          this.slots[index] = next;
          this.dirty = true;
        }
      },
    ];
  };

  useRef = <T>(value: T) => {
    const index = this.index++;
    if (!(index in this.slots)) this.slots[index] = { current: value };
    return this.slots[index] as { current: T };
  };

  useMemo = <T>(fn: () => T, dependencies: readonly unknown[]): T => {
    const index = this.index++;
    const old = this.slots[index] as
      { dependencies: readonly unknown[]; value: T } | undefined;
    if (!old || !this.equal(old.dependencies, dependencies))
      this.slots[index] = { dependencies, value: fn() };
    return (this.slots[index] as { value: T }).value;
  };

  useCallback = <T>(fn: T, dependencies: readonly unknown[]) =>
    this.useMemo(() => fn, dependencies);

  useEffect = (
    fn: () => void | (() => void),
    dependencies?: readonly unknown[],
  ) => {
    const index = this.index++;
    const old = this.slots[index] as
      { dependencies?: readonly unknown[] } | undefined;
    if (!old || !dependencies || !this.equal(old.dependencies, dependencies)) {
      this.slots[index] = { dependencies };
      this.effects.push(() => {
        this.cleanups.get(index)?.();
        const cleanup = fn();
        if (cleanup) this.cleanups.set(index, cleanup);
        else this.cleanups.delete(index);
      });
    }
  };

  render<T>(fn: () => T): T {
    let output!: T;
    for (let renders = 0; renders < 20; renders++) {
      this.index = 0;
      this.dirty = false;
      output = fn();
      for (const effect of this.effects.splice(0)) effect();
      if (!this.dirty) return output;
    }
    throw new Error("Hook harness did not settle");
  }

  unmount() {
    for (const cleanup of this.cleanups.values()) cleanup();
    this.cleanups.clear();
  }

  private equal(a: readonly unknown[] | undefined, b: readonly unknown[]) {
    return (
      a?.length === b.length &&
      b.every((value, index) => Object.is(value, a[index]))
    );
  }
}
