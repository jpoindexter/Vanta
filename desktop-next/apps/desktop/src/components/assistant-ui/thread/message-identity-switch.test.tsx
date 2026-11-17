import { useStore } from "@nanostores/react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { atom } from "nanostores";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatRuntimeBoundary } from "@/app/chat";
import { PRIMARY_SESSION_VIEW, SessionViewProvider, type SessionView } from "@/app/chat/session-view";
import { ErrorBoundary } from "@/components/error-boundary";
import type { ChatMessage } from "@/lib/chat-messages";

import { stubThreadEnvironment, stubThreadViewportSize } from "../test-utils";

import { Thread } from ".";

const caught: unknown[] = [];
const uncaught: unknown[] = [];
const consoleErrors: unknown[][] = [];
const onError = (event: ErrorEvent) => uncaught.push(event.error ?? event.message);
const onRejection = (event: PromiseRejectionEvent) => uncaught.push(event.reason);
const mutations = { onCancel: vi.fn(), onEdit: vi.fn(), onReload: vi.fn(), onThreadMessagesChange: vi.fn() };

beforeEach(() => {
  stubThreadEnvironment();
  stubThreadViewportSize();
  window.localStorage.clear();
  caught.length = 0;
  uncaught.length = 0;
  consoleErrors.length = 0;
  vi.spyOn(console, "error").mockImplementation((...args) => consoleErrors.push(args));
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
});

afterEach(() => {
  cleanup();
  window.removeEventListener("error", onError);
  window.removeEventListener("unhandledrejection", onRejection);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pair(name: string): ChatMessage[] {
  return [
    { id: `${name}-user`, role: "user", parts: [{ type: "text", text: `${name} question` }] },
    { id: `${name}-reply`, role: "assistant", parts: [{ type: "text", text: `${name} answer` }] },
  ];
}

function Surface({ view, suppressMessages = false }: { view: SessionView; suppressMessages?: boolean }) {
  const storedId = useStore(view.$storedId);
  const runtimeId = useStore(view.$runtimeId);
  return (
    <MemoryRouter>
      <ErrorBoundary label="root" fallback={() => <div data-testid="root-fallback">Root failed</div>}>
        <SessionViewProvider value={view}>
          <ChatRuntimeBoundary busy={false} suppressMessages={suppressMessages} {...mutations}>
            <Thread sessionKey={storedId} sessionId={runtimeId} />
          </ChatRuntimeBoundary>
        </SessionViewProvider>
      </ErrorBoundary>
    </MemoryRouter>
  );
}

function mount(messages: ChatMessage[]) {
  const view = {
    ...PRIMARY_SESSION_VIEW,
    $messages: atom(messages),
    $runtimeId: atom<string | null>("runtime-alpha"),
    $storedId: atom<string | null>("stored-alpha"),
    $busy: atom(false),
  };
  const rendered = render(<Surface view={view} />, {
    onCaughtError: (error) => caught.push(error),
  });
  return { ...rendered, view };
}

async function expectReply(container: HTMLElement, text: string) {
  await waitFor(() => expect(container.textContent).toContain(text));
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

function expectNoRenderErrors(container: HTMLElement) {
  expect(container.querySelector('[data-testid="root-fallback"]')).toBeNull();
  expect(caught).toEqual([]);
  expect(uncaught).toEqual([]);
  expect(consoleErrors).toEqual([]);
}

describe("real transcript identity during replacement", () => {
  it("switches Alpha through an empty snapshot to Beta without stale subscribers or render errors", async () => {
    const mounted = mount(pair("Alpha"));
    await expectReply(mounted.container, "Alpha answer");

    act(() => mounted.view.$messages.set([]));
    await waitFor(() => expect(mounted.container.textContent).not.toContain("Alpha answer"));
    act(() => {
      mounted.view.$runtimeId.set("runtime-beta");
      mounted.view.$storedId.set("stored-beta");
      mounted.view.$messages.set(pair("Beta"));
    });
    await expectReply(mounted.container, "Beta answer");
    expect(mounted.container.textContent).not.toContain("Alpha");
    expectNoRenderErrors(mounted.container);
  });

  it("keeps exact message IDs and content through reorder and a shorter history window", async () => {
    const alpha = pair("Alpha");
    const beta = pair("Beta");
    const mounted = mount([...alpha, ...beta]);
    await expectReply(mounted.container, "Beta answer");
    act(() => mounted.view.$messages.set([...beta, ...alpha]));
    await expectReply(mounted.container, "Alpha answer");
    expect([...mounted.container.querySelectorAll('[data-role="assistant"]')].map((node) => node.getAttribute("data-message-id")))
      .toEqual(["Beta-reply", "Alpha-reply"]);

    act(() => mounted.view.$messages.set(beta));
    await expectReply(mounted.container, "Beta answer");
    expect(mounted.container.textContent).not.toContain("Alpha");
    expect([...mounted.container.querySelectorAll('[data-role="assistant"]')].map((node) => node.getAttribute("data-message-id")))
      .toEqual(["Beta-reply"]);
    expectNoRenderErrors(mounted.container);
  });

  it("suppresses the outgoing route before restoring the next session without stale message reads", async () => {
    const mounted = mount(pair("Alpha"));
    await expectReply(mounted.container, "Alpha answer");
    mounted.rerender(<Surface view={mounted.view} suppressMessages />);
    await waitFor(() => expect(mounted.container.textContent).not.toContain("Alpha answer"));
    act(() => {
      mounted.view.$storedId.set("stored-beta");
      mounted.view.$runtimeId.set("runtime-beta");
      mounted.view.$messages.set(pair("Beta"));
    });
    mounted.rerender(<Surface view={mounted.view} />);
    await expectReply(mounted.container, "Beta answer");
    expect(mounted.container.textContent).not.toContain("Alpha");
    expectNoRenderErrors(mounted.container);
  });
});
