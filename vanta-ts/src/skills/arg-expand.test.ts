import { describe, it, expect } from "vitest";
import { expandArgs } from "./arg-expand.js";

describe("expandArgs — positional substitution", () => {
  it("replaces $1 with args[0]", () => {
    expect(expandArgs("Run $1 now.", ["first"])).toBe("Run first now.");
  });

  it("replaces $1..$3 with the matching positional args", () => {
    expect(expandArgs("$1 then $2 then $3", ["a", "b", "c"])).toBe("a then b then c");
  });

  it("replaces $9 with args[8]", () => {
    const args = ["1", "2", "3", "4", "5", "6", "7", "8", "ninth"];
    expect(expandArgs("ninth=$9", args)).toBe("ninth=ninth");
  });

  it("substitutes an out-of-range $5 (fewer args) with an empty string", () => {
    expect(expandArgs("[$5]", ["only-one"])).toBe("[]");
  });

  it("substitutes $0 with an empty string ($1 is the first positional)", () => {
    expect(expandArgs("[$0]", ["first"])).toBe("[]");
  });
});

describe("expandArgs — $ARGUMENTS", () => {
  it("replaces $ARGUMENTS with the args joined by a space", () => {
    expect(expandArgs("Do: $ARGUMENTS", ["fix", "the", "bug"])).toBe("Do: fix the bug");
  });

  it("replaces $ARGUMENTS with empty string when there are no args", () => {
    expect(expandArgs("Do: [$ARGUMENTS]", [])).toBe("Do: []");
  });
});

describe("expandArgs — backslash escape (literal placeholder)", () => {
  it("treats \\$1 as a literal $1 (backslash consumed, NOT substituted)", () => {
    expect(expandArgs("price is \\$1", ["SUBBED"])).toBe("price is $1");
  });

  it("treats \\$ARGUMENTS as a literal $ARGUMENTS (backslash consumed)", () => {
    expect(expandArgs("Use \\$ARGUMENTS literally", ["irrelevant"])).toBe(
      "Use $ARGUMENTS literally",
    );
  });

  it("keeps a shell positional \\$1 literal even when an arg is supplied", () => {
    // The motivating case: a body that needs a literal `$1` (a shell positional /
    // a price) survives expansion.
    expect(expandArgs('echo "$@" uses \\$1', ["arg0"])).toBe('echo "$@" uses $1');
  });

  it("treats an escaped backslash \\\\$1 as a literal backslash + substituted arg", () => {
    // `\\$1` in source = two backslashes then $1 = escaped backslash (not an
    // escape of `$`) → one literal backslash + the substituted arg.
    expect(expandArgs("path\\\\$1", ["X"])).toBe("path\\X");
  });

  it("treats \\\\\\$1 (backslash + escape) as a literal backslash + literal $1", () => {
    // Three backslashes = one escaped backslash (surviving) + one escaping
    // backslash (consumed) → `\` + literal `$1`.
    expect(expandArgs("a\\\\\\$1b", ["X"])).toBe("a\\$1b");
  });
});

describe("expandArgs — non-placeholder $ left as-is", () => {
  it("leaves a bare $ untouched", () => {
    expect(expandArgs("cost: $ and more", ["x"])).toBe("cost: $ and more");
  });

  it("leaves $x (non-digit, non-ARGUMENTS) untouched", () => {
    expect(expandArgs("var $foo and $bar", ["x"])).toBe("var $foo and $bar");
  });

  it("leaves a trailing $ untouched", () => {
    expect(expandArgs("ends with $", ["x"])).toBe("ends with $");
  });
});

describe("expandArgs — no-op / edge cases", () => {
  it("returns the body unchanged when it contains no $", () => {
    expect(expandArgs("no placeholders here", ["a", "b"])).toBe("no placeholders here");
  });

  it("returns an empty body unchanged", () => {
    expect(expandArgs("", ["a"])).toBe("");
  });

  it("does not double-process: a substituted arg containing $2 is NOT re-scanned", () => {
    // Single left-to-right pass — `$1` expands to a string that itself contains
    // `$2`, and that injected `$2` must remain literal (not replaced by args[1]).
    expect(expandArgs("$1 $2", ["uses $2", "SECOND"])).toBe("uses $2 SECOND");
  });

  it("handles an escape adjacent to a real substitution, each once", () => {
    // `\$1` stays literal; the neighboring `$2` substitutes — each handled exactly
    // once in the same pass.
    expect(expandArgs("\\$1 and $2", ["A", "B"])).toBe("$1 and B");
  });

  it("is a no-op on a placeholder-free body even with no args", () => {
    expect(expandArgs("plain text", [])).toBe("plain text");
  });
});
