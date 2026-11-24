---
id: automate-a-briefing
title: Automate a daily briefing
sidebar_position: 2
---

# Automate a daily briefing

Have Vanta assemble a morning brief on a schedule and optionally prepare a
message. Keep the outbound step at R3 Confirm unless a specifically allowlisted
R4 workflow has passed its authority, receipt, recovery, and revocation
acceptance; do not infer universal gateway coverage from this guide.

## 1. Connect the sources you want

```bash
vanta auth google gmail
vanta auth google calendar  # separate incremental scope
```

See [Comms & gateway](../comms-and-gateway.md). (Skip this if your brief only uses goals/tasks/local data.)

## 2. Try the brief by hand

```bash
vanta run "give me a today brief: unread email highlights, today's calendar, and my top 3 goals"
```

Inside a session, `/today` does the same from tasks + goals + calendar + recent memory.

## 3. Schedule it

```bash
vanta schedule "summarize my unread email + today's calendar into a brief" --cron "0 8 * * *"
vanta schedule list
```

Tasks are stored in `.vanta/cron.tsv` (5-field cron).

## 4. Make it run unattended

The scheduler fires when invoked. To have Vanta always on — running cron, polling messaging, and serving webhooks — run the gateway:

```bash
vanta gateway                 # foreground loop
vanta service install         # keep it alive via launchd (macOS)
```

## 5. Deliver it to your phone (optional)

```bash
vanta setup messaging         # pick a gateway from the menu (e.g. Telegram — paste a @BotFather token)
```

The wizard offers 22 registered messaging adapters (Telegram, Slack, Discord,
WhatsApp, Signal, iMessage, Email, and more). With the gateway running, inbound
messages route through the agent and replies come back. The standard
`send_message` tool uses the normal approval path; some gateway delivery/reply
paths are direct adapters and remain part of universal effect-mediation work.
Keep a scheduled outbound brief at explicit R3 confirmation until its exact
route has accepted R4 authority and recovery evidence. See [Permissions &
hooks](../permissions-and-hooks.md).

## Result

A scheduled brief assembled from the connected sources. Read-only assembly can
run unattended; outbound delivery is accepted only on the exact mediated route
and authority level that has been proven.
