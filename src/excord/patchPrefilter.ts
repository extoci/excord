interface FindPatch {
  find: string | RegExp;
}

const nativeTest = RegExp.prototype.test;
const nativeExec = RegExp.prototype.exec;
const special = /[.*+?^${}()|[\]\\]/g;

/** A negative-only filter. A positive result always runs the original patcher. */
export class PatchPrefilter {
  getFindStrings(): string[] {
    return [...this.strings];
  }
  private strings: string[] = [];
  private union: RegExp | undefined;
  private dirty = false;
  private expressions = new WeakMap<
    RegExp,
    { source: string; flags: string; copy: RegExp }
  >();

  couldMatch(source: string, patches: readonly FindPatch[]): boolean {
    const expressions: RegExp[] = [];
    let stringCount = 0;
    for (const patch of patches) {
      const find = patch.find;
      if (typeof find === "string") {
        if (!find.length) return true;
        if (this.strings[stringCount] !== find) {
          this.strings[stringCount] = find;
          this.dirty = true;
        }
        stringCount++;
      } else {
        // Custom matchers and sticky state must retain the original call order and effects.
        if (
          !(find instanceof RegExp) ||
          Object.getPrototypeOf(find) !== RegExp.prototype ||
          ["test", "exec", "source", "flags", "global", "sticky"].some((key) =>
            Object.hasOwn(find, key),
          ) ||
          find.test !== nativeTest ||
          find.exec !== nativeExec ||
          find.sticky
        )
          return true;
        expressions.push(find);
      }
    }
    if (this.strings.length !== stringCount) {
      this.strings.length = stringCount;
      this.dirty = true;
    }
    if (this.dirty) {
      try {
        this.union = this.strings.length
          ? new RegExp(
              this.strings
                .map((value) => value.replace(special, "\\$&"))
                .join("|"),
            )
          : undefined;
      } catch {
        return true;
      }
      this.dirty = false;
    }
    if (this.union && nativeTest.call(this.union, source)) return true;
    for (const expression of expressions) {
      let cached = this.expressions.get(expression);
      if (
        !cached ||
        cached.source !== expression.source ||
        cached.flags !== expression.flags
      ) {
        cached = {
          source: expression.source,
          flags: expression.flags,
          copy: new RegExp(expression.source, expression.flags),
        };
        this.expressions.set(expression, cached);
      }
      cached.copy.lastIndex = expression.global ? 0 : expression.lastIndex;
      if (nativeTest.call(cached.copy, source)) return true;
    }
    // On a miss the original loop would have reset every global find expression.
    for (const expression of expressions)
      if (expression.global) expression.lastIndex = 0;
    return false;
  }
}
