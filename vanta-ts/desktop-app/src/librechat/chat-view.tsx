// Adapted from LibreChat ChatView.tsx at f10b1d91f1eee3a2c82d5247bf620351486b7c1b.
// Copyright (c) 2026 LibreChat. MIT; see ./LICENSE.
// Vanta supplies every stateful slot. No upstream store, auth or API is imported.
import type { ReactNode } from "react";

export type LibreChatViewProps = {
  heading: string;
  isLandingPage: boolean;
  landing: ReactNode;
  messages: ReactNode;
  composer: ReactNode;
};

/** Stable composer band shared by landing and conversation, as in ChatView.
 * Tailwind presentation is translated into Vanta's scoped semantic-token CSS. */
export function LibreChatView({ heading, isLandingPage, landing, messages, composer }: LibreChatViewProps) {
  return <div className={`chat-conversation lc-chat-view ${isLandingPage ? "is-empty" : ""}`}
    data-landing={isLandingPage} data-interface-source="librechat">
    {!isLandingPage ? <h1 className="sr-only">{heading}</h1> : null}
    <div className="lc-message-column">{isLandingPage ? landing : messages}</div>
    <div className="lc-composer-band">{composer}</div>
  </div>;
}
