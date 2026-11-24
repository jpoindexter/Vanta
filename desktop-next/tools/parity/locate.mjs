// Turn a locator spec from a selector map into a Playwright Locator.

const LIST_SUFFIX = "[]";

export const isListKey = (key) => key.endsWith(LIST_SUFFIX);
export const baseKey = (key) => key.replace(/\[\d+\]$/, "[]");

function rootFor(scope, map, keyOf, depth) {
  if (!scope.within) return scope.root;
  const parent = map.keys[scope.within];
  if (!parent || parent === "UNMAPPED" || depth > 4) {
    throw new Error(`locator "within: ${scope.within}" must name a mapped key (found ${parent ?? "nothing"}).`);
  }
  return keyOf(scope.within, depth + 1).first();
}

function primitive(root, spec) {
  const exact = spec.exact ?? false;
  if (spec.css !== undefined) return root.locator(spec.css);
  if (spec.testId !== undefined) return root.getByTestId(spec.testId);
  if (spec.role !== undefined) {
    return root.getByRole(spec.role, spec.name === undefined ? {} : { name: spec.name, exact });
  }
  if (spec.text !== undefined) return root.getByText(spec.text, { exact });
  if (spec.label !== undefined) return root.getByLabel(spec.label, { exact });
  return root.getByPlaceholder(spec.placeholder, { exact });
}

/** Locator for a spec (used by drivers and keys). `map` resolves `within`. */
export function locatorFor(page, map, spec, depth = 0) {
  const keyOf = (k, d) => locatorFor(page, map, map.keys[k], d);
  const root = rootFor({ within: spec.within, root: page }, map, keyOf, depth);
  const loc = primitive(root, spec);
  return spec.nth === undefined ? loc : loc.nth(spec.nth);
}

/** Locator for a role key, or null when the key is unmapped. */
export function keyLocator(page, map, key) {
  const entry = map.keys[key];
  if (!entry || entry === "UNMAPPED") return null;
  return locatorFor(page, map, entry);
}
