---
id: automate-a-briefing
title: Automate a daily briefing
sidebar_position: 2
---

# Automate a daily briefing

Have Vanta assemble a morning brief on a schedule and (optionally) message it to you — every outbound action stays approval-gated.

## 1. Connect the sources you want

```bash
vanta auth google      # one-time OAuth for gmail / calendar
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
vanta setup messaging         # configure Telegram (paste a @BotFather token)
```

With the gateway running, inbound Telegram messages route through the agent and replies come back. You can also have the scheduled brief sent to you. Outbound sends are approval-gated unless you've set an auto/permission rule — see [Permissions & hooks](../permissions-and-hooks.md).

## Result

A hands-off daily brief, assembled from your real sources, with the kernel gating anything that sends or writes.
