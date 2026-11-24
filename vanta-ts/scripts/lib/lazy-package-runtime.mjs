import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const loaded = new Map();

function load(specifier) {
  if (!loaded.has(specifier)) loaded.set(specifier, require(specifier));
  return loaded.get(specifier);
}

const forward = (read) => ({
  get: (_t, key) => Reflect.get(read(), key),
  has: (_t, key) => Reflect.has(read(), key),
  ownKeys: () => Reflect.ownKeys(read()),
  getOwnPropertyDescriptor: (_t, key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(read(), key);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});

/** `import * as ns from pkg` / `import def from pkg`: resolves on first property access. */
export function lazyNamespace(specifier, useDefault = false) {
  const read = () => {
    const mod = load(specifier);
    return useDefault && mod && mod.__esModule && "default" in mod ? mod.default : mod;
  };
  return new Proxy({}, forward(read));
}

/** `import { name } from pkg` for functions and classes: resolves on first call or access. */
export function lazyMember(specifier, name) {
  const read = () => load(specifier)[name];
  return new Proxy(function lazyMember() {}, {
    ...forward(read),
    apply: (_t, self, args) => Reflect.apply(read(), self, args),
    construct: (_t, args) => Reflect.construct(read(), args),
  });
}
