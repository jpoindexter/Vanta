// Type surface for the vendored hermes-ink fork (vendor/hermes-ink), which is
// aliased as "ink" in package.json. The fork ships an index.d.ts that
// re-exports .ts source paths tsc can't follow from node_modules, so — same
// as the upstream hermes-tui consumer — we declare the module surface we use
// by hand. Runtime exports come from vendor/hermes-ink/dist (esbuild bundle).
// NOTE: no top-level imports — they would turn this file into a module and
// the declaration into an augmentation of the untyped JS package.
declare module "ink" {
  import type * as React from "react";
  export type Key = {
    readonly ctrl: boolean;
    readonly meta: boolean;
    readonly shift: boolean;
    readonly upArrow: boolean;
    readonly downArrow: boolean;
    readonly leftArrow: boolean;
    readonly rightArrow: boolean;
    readonly return: boolean;
    readonly backspace: boolean;
    readonly delete: boolean;
    readonly escape: boolean;
    readonly tab: boolean;
    readonly pageUp: boolean;
    readonly pageDown: boolean;
    readonly wheelUp: boolean;
    readonly wheelDown: boolean;
    readonly home: boolean;
    readonly end: boolean;
    readonly [key: string]: boolean;
  };

  export type InputEvent = {
    readonly input: string;
    readonly key: Key;
    readonly keypress: { readonly isPasted?: boolean; readonly raw?: string };
  };

  export type InputHandler = (input: string, key: Key, event: InputEvent) => void;

  export function useInput(handler: InputHandler, options?: { isActive?: boolean }): void;

  export function useApp(): { exit: (error?: Error) => void };

  export function useStdin(): {
    stdin: NodeJS.ReadStream;
    setRawMode: (value: boolean) => void;
    isRawModeSupported: boolean;
  };

  type LayoutProps = {
    readonly children?: React.ReactNode;
    readonly key?: React.Key;
    readonly ref?: React.Ref<unknown>;
    readonly [prop: string]: unknown;
  };

  export const Box: React.FC<LayoutProps>;
  export const Text: React.FC<LayoutProps>;
  export const Spacer: React.FC<Record<string, never>>;
  export const Newline: React.FC<{ count?: number }>;

  export type MouseTrackingMode = "all" | "buttons" | "wheel" | "off";
  export const AlternateScreen: React.FC<{ children?: React.ReactNode; mouseTracking?: MouseTrackingMode }>;

  export type ScrollBoxHandle = {
    scrollTo: (y: number) => void;
    scrollBy: (dy: number) => void;
    scrollToBottom: () => void;
    getScrollTop: () => number;
    getPendingDelta: () => number;
    getScrollHeight: () => number;
    getFreshScrollHeight: () => number;
    getViewportHeight: () => number;
    getViewportTop: () => number;
    getLastManualScrollAt: () => number;
    isSticky: () => boolean;
    subscribe: (listener: () => void) => () => void;
    setClampBounds: (min: number | undefined, max: number | undefined) => void;
  };
  export const ScrollBox: React.FC<LayoutProps & { stickyScroll?: boolean; ref?: React.Ref<ScrollBoxHandle> }>;

  export type Instance = {
    rerender: (tree: React.ReactNode) => void;
    unmount: (error?: Error) => void;
    waitUntilExit: () => Promise<void>;
    cleanup: () => void;
    clear: () => void;
  };

  export type RenderOptions = {
    stdout?: NodeJS.WriteStream;
    stdin?: NodeJS.ReadStream;
    stderr?: NodeJS.WriteStream;
    exitOnCtrlC?: boolean;
    patchConsole?: boolean;
  };

  export function renderSync(node: React.ReactNode, options?: NodeJS.WriteStream | RenderOptions): Instance;
  export default function render(node: React.ReactNode, options?: NodeJS.WriteStream | RenderOptions): Promise<Instance>;
}
