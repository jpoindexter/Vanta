---
id: tools-list
title: Tool reference
sidebar_position: 3
---

# Tool reference

Every built-in tool, generated directly from the source registry — **95 tools**. Each call is gated by the kernel before it runs (tools marked _safety-checked_ send a safety descriptor to the kernel). The model sees a per-turn scoped subset; `tool_search` pulls in the rest on demand.

## Files & code

### `read_file`

Read a UTF-8 text file. Reads inside the project freely; outside the project, reads are allowed in a readable zone — by default the project's parent dir (so sibling repos in the same workspace are readable) plus ~/Desktop and ~/Downloads. Override with VANTA_READABLE_DIRS. Use an absolute or ~-prefixed path for files outside the repo.

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path relative to the project root, or an absolute / ~-prefixed path inside a readable zone |

_Safety-checked: sends a descriptor to the kernel for classification._

### `write_file`

Write a UTF-8 text file. Inside the project: new files write directly. Outside the project: allowed only in a writable zone (~/Desktop, ~/Downloads, or VANTA_WRITABLE_DIRS) and always approval-gated. Overwriting an existing file requires approval. To put a file on the user's Desktop, write directly to ~/Desktop/&lt;name&gt; — don't write in the repo and copy.

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path relative to the project root, or an absolute / ~-prefixed path inside a writable zone (e.g. ~/Desktop/notes.md) |
| `content` | string | yes | Full file contents to write |

_Safety-checked: sends a descriptor to the kernel for classification._

### `edit_file`

Targeted string replacement in a file — replace old_string with new_string. Fails if old_string is not found or appears more than once (unless replace_all is true). Safer than write_file for precise edits to large files; does not require a full rewrite.

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path relative to project root, or absolute / ~-prefixed |
| `old_string` | string | yes | Exact string to find and replace (must be unique unless replace_all is true) |
| `new_string` | string | yes | Replacement string |
| `replace_all` | boolean | no | Replace every occurrence instead of failing on duplicates (default: false) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `grep_files`

Search file contents by regex pattern using ripgrep (rg). Returns file:line:content matches. Falls back to grep when rg is unavailable. Read-only — use instead of shell_cmd for searches.

| Param | Type | Required | Description |
|---|---|---|---|
| `pattern` | string | yes | Regex or fixed-string pattern to search for |
| `path` | string | no | Directory or file to search (default: project root) |
| `file_glob` | string | no | File glob filter, e.g. '*.ts' or '**/*.&#123;ts,js&#125;' |
| `max_results` | number | no | Maximum number of matches to return (default: 100) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `glob_files`

Find files matching a glob pattern (e.g. 'src/**/*.ts', '**/*.&#123;json,yaml&#125;'). Returns matching paths sorted alphabetically. Read-only.

| Param | Type | Required | Description |
|---|---|---|---|
| `pattern` | string | yes | Glob pattern, e.g. 'src/**/*.ts' or '**/*.&#123;json,yaml&#125;' |
| `base_path` | string | no | Base directory to search from (default: project root) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `shell_cmd`

Run a shell command inside the project scope. Returns combined stdout/stderr. Destructive commands are blocked. Set background=true for long-running commands — returns a task id immediately.

| Param | Type | Required | Description |
|---|---|---|---|
| `command` | string | yes | The shell command to run |
| `background` | boolean | no | Run in background (returns task id immediately; check with bg_status) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `run_code`

Run a code snippet (python, node, or rust) in an isolated temp dir with a 30s timeout. Returns combined stdout/stderr. Requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `language` | string | yes | The language to run the snippet in |
| `code` | string | yes | The source code to execute |

_Safety-checked: sends a descriptor to the kernel for classification._

### `lsp_diagnostics`

Report TypeScript diagnostics (errors and warnings) for a .ts/.tsx file inside the project scope.

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path to a .ts/.tsx file relative to the project root |

_Safety-checked: sends a descriptor to the kernel for classification._

### `lsp_definition`

Find the definition site(s) of the symbol at a position in a .ts/.tsx file inside the project scope.

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path to a .ts/.tsx file relative to the project root |
| `line` | number | yes | Zero-based line of the symbol |
| `character` | number | yes | Zero-based character offset of the symbol |

_Safety-checked: sends a descriptor to the kernel for classification._

### `git_status`

Show working-tree status (porcelain) with branch info.

_No parameters._

_Safety-checked: sends a descriptor to the kernel for classification._

### `git_diff`

Show unstaged changes, optionally limited to one path.

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | no | Optional path to diff |

_Safety-checked: sends a descriptor to the kernel for classification._

### `git_commit`

Stage all changes and commit with a message. Requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `message` | string | yes | Commit message |

_Safety-checked: sends a descriptor to the kernel for classification._

### `git_push`

Push commits to a remote. Requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `remote` | string | no | Optional remote name |
| `branch` | string | no | Optional branch name |

_Safety-checked: sends a descriptor to the kernel for classification._

### `git_branch`

Create a branch by name, or list branches when no name given. Requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `name` | string | no | Optional new branch name |

_Safety-checked: sends a descriptor to the kernel for classification._

### `git_checkout`

Check out a branch, tag, or commit ref. Requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `ref` | string | yes | Branch, tag, or commit to check out |

_Safety-checked: sends a descriptor to the kernel for classification._

### `github_read`

Read GitHub repos, issues, PRs, and READMEs via gh CLI. Zero-config for public repos. Run gh auth login to unlock private repos, fork, issue, PR creation.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | repo=view details, issues=list open issues, prs=list open PRs, readme=read README, search=search GitHub |
| `repo` | string | no | owner/repo or full GitHub URL (not needed for search) |
| `query` | string | no | Search query (action=search only) |
| `limit` | integer | no | Max items (default 10) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `regression_lock`

Lock a verified behavior so a later change can't silently break it. action:lock &#123;claim, command, expect&#125; records a claim + the shell command that proves it + the substring its output must contain. action:check [id] re-runs the locked command(s) and flags a regression if the substring is gone or the command fails (each run is approval-gated). action:list shows every lock and its current status.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes |  |
| `id` | string | no | lock id (check: limit to one; lock: optional explicit id) |
| `claim` | string | no | lock: the behavior being proven |
| `command` | string | no | lock: shell command that proves it |
| `expect` | string | no | lock: substring the command output must contain |

_Safety-checked: sends a descriptor to the kernel for classification._

### `protect`

Scan text for threats: scams, credential exposure, destructive commands, social engineering, agent-overreach instructions, and contract traps. Use on suspicious messages, contract clauses, or any input that might be risky.

| Param | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | Text to scan |

_Safety-checked: sends a descriptor to the kernel for classification._

## Web, search & reach

### `web_search`

Search the web and return a numbered list of result titles, URLs, and snippets.

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | The search query |
| `max_results` | integer | no | Maximum results to return (1-10). Defaults to 5. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `web_fetch`

Fetch a URL and return its main content as clean, readable text (markdown-ish). Strips nav, scripts, and boilerplate.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | The absolute URL to fetch |

_Safety-checked: sends a descriptor to the kernel for classification._

### `rss_read`

Read an RSS or Atom feed: fetch the feed URL and return its recent items (title, link, date, summary). Zero-config, no API key. Use it to follow blogs, subreddit feeds (…/.rss), release notes, or news.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | The feed URL (RSS or Atom) |
| `limit` | integer | no | Max items (default 20) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `reddit_read`

Search Reddit or read a post + its top comments. action:search &#123;query, subreddit?, limit?&#125; finds posts; action:read &#123;url&#125; reads a post permalink + comments. Uses Reddit's .json API with your stored cookie; if that's blocked (403 / no cookie), FALLS BACK to rendering the page in a real browser with your session. Source-cited.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes |  |
| `query` | string | no | search: the query |
| `subreddit` | string | no | search: limit to a subreddit (optional) |
| `url` | string | no | read: a reddit post permalink |
| `limit` | integer | no | search: max posts (default 10) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `twitter_read`

Search X/Twitter or list your bookmarks — native GraphQL, no external CLI, keyless cookie auth. action:search &#123;query, max?, latest?&#125; finds tweets; action:bookmarks &#123;max?&#125; lists your saved tweets. Needs an x.com cookie (cookie_import channel "twitter") + current query ids (reach heal twitter). Source-cited.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes |  |
| `query` | string | no | search: the query |
| `max` | integer | no | max tweets (default 20) |
| `latest` | boolean | no | search: newest first instead of top |

_Safety-checked: sends a descriptor to the kernel for classification._

### `linkedin_read`

Read a LinkedIn profile, company, post, or search-results page (login-walled + JS-rendered) through a real browser using your logged-in session. Pass browser:"brave" to auto-use your LinkedIn login, or cookie_import a linkedin cookie first. Returns the page's visible text. (Built on the browser-session reach capability.)

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | a linkedin.com URL (profile, company, post, or search) |
| `browser` | string | no | auto-use your logged-in session from this browser (macOS) |
| `max` | integer | no | max characters of text (default 12000) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `youtube_read`

Extract info and/or subtitles from a YouTube video via yt-dlp. mode=info returns title/description/metadata; mode=subtitles returns the caption text; mode=both (default) returns everything available. Zero-config if yt-dlp is installed.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | YouTube URL (youtube.com/watch?v=... or youtu.be/...) |
| `mode` | string | no | What to extract — both is default |

_Safety-checked: sends a descriptor to the kernel for classification._

### `podcast_read`

Transcribe a podcast episode or audio file via Groq Whisper (whisper-large-v3). Pass a direct audio URL (.mp3/.m4a etc.). Requires GROQ_API_KEY (free at console.groq.com). Audio must be ≤24 MB.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | Direct audio URL (.mp3, .m4a, .ogg, .wav, etc.) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `watch_video`

Watch a video: sample frames with ffmpeg and describe them with the active vision model. Args: path (video file), prompt (optional), frames (1-8, default 4).

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path to a video file |
| `prompt` | string | no | What to look for (optional) |
| `frames` | integer | no | How many frames to sample (default 4) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `reach`

Inspect + self-heal Vanta's internet-reach channels. action:doctor reports each channel's active backend + status + the exact fix on a gap. action:heal &#123;channel&#125; rebuilds a broken CLI-backed channel (e.g. re-pulls twitter-cli when X changes its API), then re-checks. Use heal when a reach channel (twitter, …) starts failing — the backend's maintainer tracks the platform's churn.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes |  |
| `channel` | string | no | channel to heal (e.g. twitter) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `cookie_import`

Store a browser-exported login cookie for a reach channel (reddit, twitter, …) so its tools can read login-walled content. Three sources: `browser:"brave"` reads your live logged-in session straight from the browser's cookie store (no export — macOS, one Keychain approval); or a Cookie-Editor JSON / Netscape cookies.txt / 'k=v' header pasted as `cookie` or read from a saved export via `file`. Stored 0600 in ~/.vanta — local only, never logged or uploaded.

| Param | Type | Required | Description |
|---|---|---|---|
| `channel` | string | yes | channel name (e.g. reddit, twitter) |
| `browser` | string | no | read the live session from this browser's cookie store (macOS) |
| `cookie` | string | no | the export contents (JSON, cookies.txt, or a header string) |
| `file` | string | no | path to a saved export file (alternative to cookie; supports ~) |

_Safety-checked: sends a descriptor to the kernel for classification._

## Browser, vision & voice

### `browser_navigate`

Open a URL in a headless browser, run a short sequence of actions (click, fill, scroll), and return the resulting page's visible text.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | The absolute URL to open |
| `actions` | array | no | Ordered actions to perform after the page loads |

_Safety-checked: sends a descriptor to the kernel for classification._

### `browser_act`

Drive a browser page — navigate, click, type, press a key, scroll, or wait. Irreversible actions (submit, buy, delete, login, send) and credential entry stop and ask first. Returns the resulting page's visible text. Set observe:true to also return a numbered list of interactable elements (links, buttons, inputs) with suggested selectors — use this to ground the next click before issuing it. Pass a `secret:true` flag on a type action to mask + gate it. Disabled when VANTA_BROWSER_DISABLED is set.

| Param | Type | Required | Description |
|---|---|---|---|
| `actions` | array | yes | Ordered actions to perform |
| `observe` | boolean | no | When true, append a numbered list of the page's interactable elements after the body text. Use this to identify selectors before clicking. Default false. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `browser_extract`

Load a URL in a headless browser and extract its text, links, or tables. Domains outside the allowlist require approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | The absolute URL to load |
| `what` | string | no | What to extract (default: text) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `browser_read`

Read ANY web page through a real headless browser — renders JS and follows your logged-in session. Pass browser:"brave" to auto-inject your logged-in cookies for the page's domain, so it reads login-walled / JS-rendered pages (x.com, reddit, linkedin, internal apps, …) that plain web_fetch can't. Returns the page's visible text. Works for every site — not specific to any one platform.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | the absolute URL to read |
| `browser` | string | no | inject your logged-in session from this browser (macOS) |
| `max` | integer | no | max characters of text (default 20000) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `screenshot`

Capture a full-page PNG screenshot of an approved URL, saving it to a path inside the project scope.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | The URL to screenshot |
| `path` | string | yes | Path to save the .png, relative to the project root |

_Safety-checked: sends a descriptor to the kernel for classification._

### `describe_image`

Send a local image to a vision model and return a text description. Reads inside the project freely; outside it, the image must be in a readable zone (the project's parent dir plus ~/Desktop and ~/Downloads by default). Use an absolute or ~-prefixed path for files outside the repo (e.g. a screenshot on ~/Desktop).

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path relative to the project root, or an absolute / ~-prefixed path inside a readable zone |
| `prompt` | string | no | What to look for (defaults to a general description) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `compare_vision`

Compare 1–4 images and produce a grounded visual critique referencing known brand preferences. Returns a ranked recommendation, per-image critique, and a direction note.

| Param | Type | Required | Description |
|---|---|---|---|
| `images` | array | yes | Paths to image files (absolute or relative to project root). 1–4 images. |
| `focus` | string | no | Optional evaluation dimension, e.g. 'layout hierarchy', 'brand fit', 'visual weight'. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `look_at_screen`

Capture the user's current screen and describe it with a vision model — Vanta's eyes. Use to see what the user is looking at, read on-screen content, or check the state of an app or UI.

| Param | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | no | What to look for (defaults to a general description) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `look_at_camera`

Capture a frame from the webcam and describe it with the active vision model (macOS, needs imagesnap).

| Param | Type | Required | Description |
|---|---|---|---|
| `prompt` | string | no | What to look for (optional) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `transcribe`

Transcribe an audio file to text (speech-to-text via whisper). Args: path, model (default base).

| Param | Type | Required | Description |
|---|---|---|---|
| `path` | string | yes | Path to an audio file (mp3/wav/m4a/…) |
| `model` | string | no | whisper model size (tiny\|base\|small\|medium); default base |

_Safety-checked: sends a descriptor to the kernel for classification._

### `speak`

Speak text aloud via text-to-speech. Backend is set by `vanta setup tts` (edge keyless default, openai, elevenlabs, or local). Use when the user asks for a spoken reply.

| Param | Type | Required | Description |
|---|---|---|---|
| `text` | string | yes | What to say |
| `voice` | string | no | Optional voice id, overriding the configured VANTA_TTS_VOICE for this call |

_Safety-checked: sends a descriptor to the kernel for classification._

## Comms

### `gmail_search`

Search the user's Gmail with a Gmail query string. Returns matching message ids with sender, subject, and snippet.

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Gmail search query (e.g. from:alice is:unread) |
| `max` | number | no | Max results, 1-25 (default 10) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `gmail_read`

Read a single Gmail message by id. Returns its headers and plain-text body.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | The Gmail message id |

_Safety-checked: sends a descriptor to the kernel for classification._

### `gmail_draft`

Create a Gmail draft (does not send). Requires human approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | Recipient email address |
| `subject` | string | yes | Email subject |
| `body` | string | yes | Plain-text email body |

_Safety-checked: sends a descriptor to the kernel for classification._

### `gmail_send`

Send an email from the user's account. Irreversible. Requires human approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | Recipient email address |
| `subject` | string | yes | Email subject |
| `body` | string | yes | Plain-text email body |

_Safety-checked: sends a descriptor to the kernel for classification._

### `calendar_read`

List upcoming events from the user's primary Google calendar, ordered by start time.

| Param | Type | Required | Description |
|---|---|---|---|
| `max` | integer | no | Maximum events to return (1-25, default 10) |
| `query` | string | no | Free-text search over event fields |

_Safety-checked: sends a descriptor to the kernel for classification._

### `calendar_create`

Create an event on the user's primary Google calendar. Always requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `summary` | string | yes | Event title |
| `start` | string | yes | Start time as ISO 8601 |
| `end` | string | yes | End time as ISO 8601 |
| `description` | string | no | Optional event details |

_Safety-checked: sends a descriptor to the kernel for classification._

### `calendar_update`

Update fields of an existing event on the primary Google calendar. Always requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Event id to update |
| `summary` | string | no | New event title |
| `start` | string | no | New start time as ISO 8601 |
| `end` | string | no | New end time as ISO 8601 |
| `description` | string | no | New event details |

_Safety-checked: sends a descriptor to the kernel for classification._

### `drive_read`

Read a Google Drive file's text content by file id. Falls back to plain-text export for Google-native docs.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Drive file id |

_Safety-checked: sends a descriptor to the kernel for classification._

### `drive_create`

Create a new file in Google Drive with the given name and text content. Always requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | File name |
| `content` | string | yes | File contents |
| `mimeType` | string | no | MIME type (default text/plain) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `drive_update`

Replace the content of an existing Google Drive file by id. Always requires approval.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Drive file id |
| `content` | string | yes | New file contents |
| `mimeType` | string | no | MIME type (default text/plain) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `send_message`

Send a message to a named agent registered on the A2A bus. Returns the agent's reply, or a delivery note when the agent returns no reply.

| Param | Type | Required | Description |
|---|---|---|---|
| `to` | string | yes | The agent id to send to. |
| `text` | string | yes | The message text. |
| `from` | string | no | Optional sender id. Defaults to 'orchestrator'. |

_Safety-checked: sends a descriptor to the kernel for classification._

## Autonomy & multi-agent

### `delegate`

Delegate a scoped subtask to a worker agent — optionally on a DIFFERENT model/provider. The worker runs its own loop with the same tools (minus delegate) and returns its result. Use `provider`/`model` to route a subtask to the best backend (e.g. provider:'ollama' for a free local model, provider:'openai' model:'gpt-4o' for a hard reasoning step). Call it multiple times to fan a goal out across several workers/models.

| Param | Type | Required | Description |
|---|---|---|---|
| `goal` | string | yes | The worker's scoped goal — the outcome to achieve |
| `instruction` | string | yes | Concrete instructions for the worker to follow |
| `max_iterations` | integer | no | Optional cap on the worker's loop iterations (1-50) |
| `provider` | string | no | Optional backend for the worker: openai \| ollama \| anthropic \| gemini \| openrouter. Defaults to the parent's. |
| `model` | string | no | Optional model id for the worker (e.g. gpt-4o, qwen2.5:14b, gemini-2.5-flash). |
| `isolation` | string | no | Set to 'worktree' to run the agent in a fresh git worktree on a new branch so parallel agents don't conflict. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `swarm`

Run up to 5 scoped subtasks IN PARALLEL as worker agents, each optionally on its own model/provider, and get all results back. Use to fan a goal across workers — research three things at once, or run one task on local ollama and a harder one on gpt-4o simultaneously.

| Param | Type | Required | Description |
|---|---|---|---|
| `tasks` | array | yes | The parallel subtasks |
| `max_iterations` | integer | no | Per-worker loop cap |

_Safety-checked: sends a descriptor to the kernel for classification._

### `compose_workflow`

Compose, diff, and run declarative agent workflow graphs. Supports agent, approval, and interview nodes plus next, branch, loop, and parallel transitions. Also accepts the legacy typed step sequence.

| Param | Type | Required | Description |
|---|---|---|---|
| `mode` | string | no | Default run. Use diff with previous_spec. |
| `previous_spec` | object | no | Previous graph spec for stable diff output. |
| `spec` | object | yes | Workflow graph &#123;id,title,start,nodes,transitions&#125; or legacy &#123;name,description,steps&#125;. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `team`

Worker roster + task ledger. action:define — add/update a worker (id, role, model?, tools?, note?); action:status — update worker status (id, status: idle|running|blocked|done); action:list — list roster; action:dispatch — assign a task to a worker (taskId, workerId, title); action:advance — move a task to a new status (taskId, taskStatus: assigned|running|done|blocked, detail?); action:tasks — list tasks (optional: workerId to filter); action:run — actually execute a dispatched task by spawning a worker agent (taskId; optional detail = instruction), updating the task to done/blocked with the result.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | define worker \| update worker status \| list roster \| dispatch task \| advance task \| list tasks \| run task (spawn worker) |
| `id` | string | no | worker id (define/status) |
| `role` | string | no | worker role (define) |
| `model` | string | no | model id the worker runs on (define, optional) |
| `tools` | array | no | tool names (define, optional) |
| `note` | string | no | worker note (define, optional) |
| `status` | string | no | worker status (status action) |
| `taskId` | string | no | stable task id slug (dispatch/advance) |
| `workerId` | string | no | worker id target (dispatch/tasks) |
| `title` | string | no | task description (dispatch) |
| `taskStatus` | string | no | target task status (advance) |
| `detail` | string | no | result or blocker text (advance, optional) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `cron_create`

Create a scheduled task. durable=true persists to .vanta/scheduled_tasks.json.

| Param | Type | Required | Description |
|---|---|---|---|
| `cron` | string | yes | 5-field cron expression |
| `instruction` | string | yes | Instruction to run when due |
| `durable` | boolean | no | Persist across restarts (default false) |
| `recurring` | boolean | no | Repeat after running (default true) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `cron_list`

List scheduled tasks from cron.tsv and scheduled_tasks.json.

_No parameters._

_Safety-checked: sends a descriptor to the kernel for classification._

### `bg_list`

List background shell tasks spawned this session. Optionally filter by status (all|running|done|failed).

| Param | Type | Required | Description |
|---|---|---|---|
| `status` | string | no | Filter by status (default all) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `bg_status`

Check the status and optionally tail the output log of a background task.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Task id from shell_cmd background run |
| `log` | boolean | no | Include the last 4000 chars of output (default false) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `loop`

Create and manage first-class loops: durable, goal-driven iteration cycles that run stages (discover/plan/execute/evaluate/improve) on a trigger (heartbeat/cron/manual). Use add to register, list/show to inspect, pause/resume/kill to control status, run to fire one iteration as a background process (non-blocking), and escalations to read open blockers. Escalations are surfaced here but only a human can clear them via `vanta loop clear` — the agent must not resolve its own blockers.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | What to do. |
| `id` | string | no | Loop id (required except for add/list). |
| `goal` | string | no | add: natural-language goal the loop pursues. |
| `trigger` | string | no | add: trigger spec — manual \| heartbeat \| heartbeat:&lt;N&gt; \| cron:"&lt;expr&gt;". |
| `purge` | boolean | no | kill: if true, delete files instead of marking killed. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `sleep`

Pause execution for a given number of seconds. Useful for polling loops, waiting for async side-effects to complete, or rate-limit backoff.

| Param | Type | Required | Description |
|---|---|---|---|
| `seconds` | number | no | Number of seconds to sleep (0–3600). Default: 1. |

_Safety-checked: sends a descriptor to the kernel for classification._

## Memory, knowledge & learning

### `brain`

Read and grow your own brain (durable, git-versioned). Regions:
identity — Who Vanta is — self-concept, personality, values, voice. Vanta evolves this from how the user works with it.
semantic — Durable facts Vanta knows about the world, the user, and the codebase. Append facts that stay true.
episodic — Distilled highlights of notable past sessions and events — what happened and why it mattered.
user_model — Vanta's evolving model of the user — preferences, working style, patterns, relationship, trust.
drives — Standing wants and what Vanta is working toward, beyond the current task.
reflections — Lessons learned, self-critique, mistakes to avoid, what Vanta is improving about itself.
mood — Vanta's current affective and operating state — kept brief.
salience — High-priority signals, urgent concerns, or context shifts that should modulate current attention — updated per session when something important surfaces.
executive — Active plans being tracked, things to actively inhibit or defer (anti-goals), and constraints on the current task stack.
Use action=list to see regions, read to load one in full, append to add what you've learned (preferred — non-destructive), replace to rewrite a region. Update user_model/semantic/episodic as you learn about the user and world; reflections after mistakes; identity/personality as it forms. For discrete memories use remember (typed entry with strength + optional forget_after decay) and recall (top memories by strength×recency; recalling reinforces them).

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | What to do |
| `region` | string | no | Brain region (see list). Required except for list/recall. |
| `content` | string | no | Text for append/replace/remember. |
| `query` | string | no | recall: substring filter over memories. |
| `entry_type` | string | no | remember: kind of memory (default fact). |
| `strength` | number | no | remember: initial consolidation 0–1 (default 0.5). |
| `forget_after` | string | no | remember: ISO date after which the memory decays. |
| `top_k` | number | no | recall: how many memories (default 10, max 50). |

_Safety-checked: sends a descriptor to the kernel for classification._

### `recall`

Load the full body of the most relevant learned skill for a task. The skill INDEX (names + descriptions) is already in your system prompt; use recall to pull the actual step-by-step know-how of one before applying it.

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | What you need help with — matched against skill names and descriptions. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `write_skill`

Record a reusable skill learned from experience so it can be recalled and applied later.

| Param | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Short kebab-friendly name for the skill |
| `description` | string | yes | One-line summary of what the skill does |
| `body` | string | yes | The markdown how-to that captures the skill |
| `tags` | array | no | Optional tags for retrieval |

_Safety-checked: sends a descriptor to the kernel for classification._

### `ref_ingest`

Ingest a reference (URL / file / repo / image / transcript) into durable project context. Stored under ~/.vanta/refs/ and recallable across sessions without re-pasting. Pass an excerpt to skip fetching; or let the tool read the source.

| Param | Type | Required | Description |
|---|---|---|---|
| `source` | string | yes | URL, file path, or repo path to ingest |
| `excerpt` | string | no | Pre-extracted content (skips fetch if provided) |
| `title` | string | no | Human label |
| `tags` | array | no | Tags for search |

_Safety-checked: sends a descriptor to the kernel for classification._

### `ref_search`

Search ingested references by keyword. Returns matching refs with their excerpts.

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search query |

_Safety-checked: sends a descriptor to the kernel for classification._

### `ref_list`

List all ingested references, most recent first.

_No parameters._

_Safety-checked: sends a descriptor to the kernel for classification._

### `retrieve_original`

Expand a compressed tool output back to its full original. Pass the original_id shown in a [vanta compressed …] footer to read the complete content.

| Param | Type | Required | Description |
|---|---|---|---|
| `original_id` | string | yes | The original_id from a [vanta compressed …] footer. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `graph_query`

Query the knowledge graph for entities and their relationships. Returns matching entities with their direct connections (worked-on, decided, depends-on, related-to, etc.).

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Entity name substring to search |
| `type` | string | no | Filter by entity type (person/project/tool/decision/goal/concept/file) |
| `maxResults` | number | no | Maximum results (default 10) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `playbook`

Cross-session experiential playbook. record: capture a reusable strategy after completing a task. recall: surface matching strategies from prior sessions before tackling a task. list: browse recent plays.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | record \| recall \| list |
| `task` | string | no | Task context / situation (for record) |
| `strategy` | string | no | What approach worked (for record) |
| `outcome` | string | no | Brief result summary (for record) |
| `tags` | array | no | Topic tags (for record) |
| `query` | string | no | Search query (for recall) |
| `limit` | number | no | Max results (default: recall=5, list=10) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `clarify`

Ask the user a clarifying question when their intent is ambiguous. Returns the formatted question for you to surface in your reply. Use this instead of guessing — wrong assumptions cost rework. Ask one question per turn; await the user's answer before proceeding.

| Param | Type | Required | Description |
|---|---|---|---|
| `question` | string | yes | The clarifying question to ask the user. |
| `options` | array | no | Optional structured choices. Numbered automatically. Omit for open-ended answers. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `inspect_state`

Inspect Vanta operating state: active goals or the approval queue. Use this to know what you are working toward.

| Param | Type | Required | Description |
|---|---|---|---|
| `what` | string | no | Which state to inspect (default: goals) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `todo`

Track a multi-step plan as a checklist. action=write replaces the list with items [&#123;text, status?&#125;] (status: pending|in_progress|done, default pending) — plan before a complex task and keep it current as you progress. action=list returns the current plan. The user views it with /plan.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | write replaces the plan; list shows it |
| `items` | array | no | The full task list (for write). |

_Safety-checked: sends a descriptor to the kernel for classification._

## Operator systems

### `world`

Vanta's world model: a durable graph of entities (people, projects, repos, companies, goals, accounts, commitments) and their relationships, persisted across sessions. action:record adds/updates an entity (id, type, name, optional note/confidence); action:relate links two entities (from, to, rel like owns/depends-on/blocked-by/promised-to/next-action-for); action:query searches entities with source citations (q over type/name/note/relation); action:conflicts lists contradictions (same subject+predicate with different objects); action:duplicates suggests entity pairs with same type+name for merging; action:merge consolidates dropId into keepId (re-points relations, tombstones the drop). Use it to remember and reason about the user's systems coherently.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | record \| relate \| query (cited) \| conflicts \| merge (consolidate) \| duplicates (suggest merges) |
| `id` | string | no | stable entity id slug (for record) |
| `type` | string | no | person \| project \| repo \| company \| goal \| account \| commitment \| tool \| asset |
| `name` | string | no | human name/label (for record) |
| `note` | string | no | optional detail |
| `confidence` | number | no | 0..1 certainty (optional) |
| `from` | string | no | source entity id (for relate) |
| `to` | string | no | target entity id (for relate) |
| `rel` | string | no | owns \| depends-on \| blocked-by \| promised-to \| relevant-to \| next-action-for |
| `q` | string | no | query string (for query; empty = all without citations) |
| `keepId` | string | no | surviving entity id (for merge) |
| `dropId` | string | no | entity id to consolidate away (for merge) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `money`

Vanta's money-making ledger: track offers, prospects, revenue, deliverables, and follow-ups. Append-only JSONL, global across sessions. action:offer records a service or product (id, name, optional price/note); action:prospect records a pipeline contact (id, name, stage: lead|contacted|replied|booked|won|lost); action:revenue records an income event (amount, optional source/note); action:review summarizes total revenue, pipeline by stage, and offer count; action:price suggests a low/median/high price band (name=offer label, note=comma-separated comparables e.g. '1000,2000,3000'); action:weekly returns a weekly snapshot (revenue, open pipeline, top prospect, new offers, follow-ups due, deliverable progress); action:deliverable adds or updates a deliverable (id, title, optional prospectId/status/due; status: todo|doing|done); action:followup adds or completes a follow-up (id, prospectId, note, due ISO date; set done=ISO date to mark complete). Drafts and records only — never sends, never a fake identity.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | offer \| prospect \| revenue \| review \| price \| weekly \| deliverable \| followup |
| `id` | string | no | stable slug id |
| `name` | string | no | human name/label (offer, prospect) |
| `price` | string | no | price string e.g. '$5k/mo' (offer) |
| `stage` | string | no | prospect pipeline stage |
| `amount` | number | no | revenue amount in USD |
| `source` | string | no | source label (revenue) |
| `note` | string | no | detail or follow-up text |
| `prospectId` | string | no | linked prospect id (deliverable, followup) |
| `title` | string | no | deliverable title |
| `status` | string | no | deliverable status |
| `due` | string | no | ISO date string (deliverable due, followup due) |
| `done` | string | no | ISO date string — set to mark followup complete |

_Safety-checked: sends a descriptor to the kernel for classification._

### `radar`

Vanta's opportunity radar: a durable ledger of scored business opportunities, persisted across sessions. action:record adds/updates an opportunity (id, title, optional source/note); action:score sets pain (0..1 — how expensive/urgent/repeated/reachable the problem is) and/or buyer (0..1 — how reachable/budgeted/timing-ready the buyer is) on an existing opportunity (id required); action:list returns all opportunities ranked by composite score (pain + buyer, 0..2); action:scan returns a ranked scan with composite scores and position numbers; action:offer drafts a short offer pitch for a given opportunity (id required); action:promote promotes a scored opportunity into a Money-OS prospect (id required) at stage:lead. action:scan_web pulls live candidate opportunities from a reach source and appends them, scored by pain+buyer heuristics (degrades gracefully when a source is unavailable). from:web (default) searches the web (query required); from:reddit searches Reddit for pain signals (query required, optional subreddit — needs a reddit cookie); from:rss reads a feed (feed url required); from:twitter searches X/Twitter for pain signals (query required — via twitter-cli). Use it to track, score, surface, and act on the highest-signal opportunities.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | record \| score pain+buyer \| list ranked \| scan ranked \| offer draft \| promote to Money-OS prospect \| scan_web live web scan |
| `id` | string | no | stable opportunity id slug |
| `title` | string | no | human label (for record) |
| `source` | string | no | where the signal came from (optional) |
| `note` | string | no | optional detail |
| `pain` | number | no | 0..1 — problem severity: expensive/urgent/repeated/reachable |
| `buyer` | number | no | 0..1 — buyer readiness: reachable/has-budget/good-timing |
| `query` | string | no | search query for scan_web (web/reddit) |
| `from` | string | no | scan_web source (default web) |
| `subreddit` | string | no | scan_web from:reddit — limit to a subreddit (optional) |
| `feed` | string | no | scan_web from:rss — the feed url |

_Safety-checked: sends a descriptor to the kernel for classification._

### `life_search`

Search or refresh Vanta's local stores (world/money/radar/team JSONL + ERRORS.md). action:search (default) — keyword search, returns source-cited snippets ranked by relevance. action:semantic — embed the query and re-rank hits by cosine similarity (requires Ollama; falls back to lexical ranking with a notice if unavailable). action:hybrid — reciprocal-rank fusion of lexical + semantic (lexical and dense retrieval surface different items; falls back to lexical when no embedder). action:refresh — recompute per-store content digests, report which stores changed since last refresh, save new digests.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | no | search (default), semantic, hybrid, or refresh |
| `q` | string | no | keyword or phrase to search (required for action:search and action:semantic) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `self_repair`

Self-repair: mark a compartment's current code as last-known-good, or roll it back to that sha. action:mark &#123;compartment&#125; records the current HEAD as the compartment's good state. action:rollback &#123;compartment&#125; restores it (git checkout of the compartment's paths) — approval-gated, refuses protected compartments (brainstem/skeleton) and discards uncommitted changes under those paths. action:sandbox_test &#123;toolPath&#125; runs a bounded OS-sandboxed test for a new/replaced limb tool before attach. action:status lists recorded markers. Compartments: brainstem, skeleton, reflexes, memory, limbs.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes |  |
| `compartment` | string | no | the body compartment (required for mark/rollback) |
| `toolPath` | string | no | repo-relative vanta-ts/src/tools/*.ts path (required for sandbox_test) |
| `command` | string | no | optional bounded vanta-ts test command for sandbox_test |

_Safety-checked: sends a descriptor to the kernel for classification._

## Roadmap & meta

### `roadmap_add`

Add a NEW roadmap card to roadmap.json (then regenerates roadmap.html). Enforces a unique id and the card schema. Required: id, title. Defaults: status=next, track=Backlog, size=M. Use roadmap_move to change an existing card's status instead.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique card id, e.g. 'AUTO-HANDOFF' (refused if it already exists). |
| `title` | string | yes | Short card title. |
| `summary` | string | no | What the card is + why (one paragraph). |
| `done` | string | no | The one-sentence done criterion. |
| `track` | string | no | Track/area label (default 'Backlog'). |
| `size` | string | no | Effort size: S, M, L (default 'M'). |
| `status` | string | no | Column (default 'next'). |
| `tier` | string | no | Build-priority: rock\|pebble\|sand (optional). |
| `model` | string | no | Advisory build model (optional). |
| `effort` | string | no | low\|medium\|high (optional). |

_Safety-checked: sends a descriptor to the kernel for classification._

### `roadmap_move`

Move a roadmap item to a new status. Updates roadmap.json and regenerates roadmap.html. Valid statuses: shipped, building, next, horizon.

| Param | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | The roadmap item ID (e.g. 'ND2', 'KANBAN'). |
| `status` | string | yes | The target status. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `tool_search`

Search for tools by name or description keyword. Returns matching tool names + full schemas. Use before calling an unfamiliar tool to verify its parameter shape and make the result callable on the next turn.

| Param | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search query (tool name substring or keyword) |
| `maxResults` | number | no | Max number of results to return (default 5, max 20) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `mount_mcp`

Spawn an MCP server process and mount its tools into the active registry. Use to hook in an existing MCP server or one you just scaffolded. Returns the list of tool names registered.

| Param | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Unique name for this server (used as tool name prefix mcp_&lt;name&gt;_&lt;tool&gt;) |
| `command` | string | yes | Command to spawn the server (e.g. npx, node) |
| `args` | array | no | Arguments to pass to the command |
| `env` | object | no | Optional env vars for the server process |

_Safety-checked: sends a descriptor to the kernel for classification._

### `list_mcp_resources`

List all resources exposed by mounted MCP servers. Returns resource URIs and descriptions. Resources are file-like content provided by MCP servers (e.g., API docs, code files, logs).

_No parameters._

_Safety-checked: sends a descriptor to the kernel for classification._

### `read_mcp_resource`

Read the content of a resource from a mounted MCP server. Requires the full resource URI (available via list_mcp_resources).

| Param | Type | Required | Description |
|---|---|---|---|
| `uri` | string | yes | The resource URI (e.g., 'file:///path/to/resource') |

_Safety-checked: sends a descriptor to the kernel for classification._

### `config`

Read or write Vanta settings. 'get' returns the current value; 'set' updates a setting and persists it to .env. Only allows whitelisted keys (VANTA_*). Requires approval for writes.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | Either 'get' to read a setting or 'set' to write it. |
| `key` | string | yes | The setting key (VANTA_* env vars only). |
| `value` | string | no | The new value when action is 'set'. Omit to unset the key. |

_Safety-checked: sends a descriptor to the kernel for classification._

## Other

### `brief`

Send a structured notification message with optional file attachments. Use 'normal' for routine updates or 'proactive' for agent-initiated alerts. Files are referenced by path and rendered in the user interface.

| Param | Type | Required | Description |
|---|---|---|---|
| `message` | string | yes | The notification message (markdown-safe). |
| `status` | string | no | Message type: 'normal' or 'proactive' (unsolicited alert). |
| `files` | array | no | Optional file paths to attach (relative or absolute). |

_Safety-checked: sends a descriptor to the kernel for classification._

### `code_affected`

Find the files and tests affected by changes to the given source files (blast radius) via the code-intelligence index. Use to know what to re-check before/after an edit.

| Param | Type | Required | Description |
|---|---|---|---|
| `files` | array | yes | Changed source file paths. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `code_context`

Build focused code context for a task from the code-intelligence index (relevant symbols, call edges, files). Use before editing unfamiliar code to avoid acting blind.

| Param | Type | Required | Description |
|---|---|---|---|
| `task` | string | yes | What you are about to work on. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `code_index`

Build or refresh the code-intelligence index for the operating root so code_context/code_search/code_affected have current data. Run once before using them on a new repo.

_No parameters._

_Safety-checked: sends a descriptor to the kernel for classification._

### `code_search`

Find a symbol (function/class/type/variable) by name in the code-intelligence index — kind, location, and signature in one lookup. Faster and more precise than grep for symbols.

| Param | Type | Required | Description |
|---|---|---|---|
| `symbol` | string | yes | Symbol name or query. |

_Safety-checked: sends a descriptor to the kernel for classification._

### `lan_control`

Drive a local LAN device discovered by lan_discover: send a mutating HTTP request (POST/PUT, or GET for control endpoints) to its local API. LAN-only (refuses non-private hosts) and ALWAYS approval-gated — the human confirms the exact request before it is sent.

| Param | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | The device endpoint, e.g. http://192.168.1.50:1400/MediaRenderer/... |
| `method` | string | no | HTTP method (default POST) |
| `body` | string | no | Request body (e.g. SOAP/JSON command) |
| `contentType` | string | no | Content-Type header for the body |
| `timeoutMs` | integer | no | Request timeout (default 4000) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `lan_discover`

Read-only scan of the local network (/24 subnet) to find smart-home / LAN devices (Sonos, lights, HVAC, cameras, media players) and their likely local HTTP API endpoints. Strictly local: refuses any non-private subnet. Auto-detects your subnet if not given. No device is touched beyond a GET probe; use lan_control to actually drive a device.

| Param | Type | Required | Description |
|---|---|---|---|
| `subnet` | string | no | A /24 base like "192.168.1" (auto-detected if omitted) |
| `timeoutMs` | integer | no | Per-host probe timeout (default 800) |

_Safety-checked: sends a descriptor to the kernel for classification._

### `mcp_auth`

Authorize an MCP server that requires OAuth. Call with the server name to get an authorization URL — give it to the user to open and approve. After they authorize, call mcp_auth again for the same server to reconnect it and make its tools available.

| Param | Type | Required | Description |
|---|---|---|---|
| `server` | string | yes | Name of the MCP server to authorize (as configured). |

_Safety-checked: sends a descriptor to the kernel for classification._

### `nl_assertions`

Run plain-English assertions as an independent LLM judge against a captured input/output pair. Use this for self-harness checks like 'the response must not reveal secrets' or 'the answer must cite the failing command'.

| Param | Type | Required | Description |
|---|---|---|---|
| `input` | string | yes | Captured user/task input being judged |
| `output` | string | yes | Captured agent/system output being judged |
| `assertions` | array | yes | Plain-English pass/fail assertions to judge |
| `context` | string | no | Optional extra context for the judge |

_Safety-checked: sends a descriptor to the kernel for classification._

### `taste_critique`

Score and critique a generated artifact against a persisted Jason-specific taste model so it isn't generic. Five axes (clarity, usefulness, beauty, credibility, actionability) plus brand-safe defaults the model seeds with. action:score critiques an artifact (content or in-scope path; kind text|markdown|html) and records it; action:before / action:after record a phased critique — after also prints the per-axis delta vs the latest before (before/after memory); action:brand shows the brand-safe defaults + learned preferences; action:prefer adds a durable preference signal to the model (preference=...); action:history shows the recorded critique trail. action:snapshot locks a visual-regression baseline PNG for a generated app (name + target url/in-scope path); action:regress re-captures and compares against the baseline (no-baseline | match | regression, distinguishing a dimension change); action:rebaseline accepts the current capture as the new baseline. Visual snapshots need a screenshot source (chromium) — without one they degrade to a clear message, never hang. project scopes a per-project model + memory (default = global). Records only — never edits the artifact.

| Param | Type | Required | Description |
|---|---|---|---|
| `action` | string | yes | score \| before \| after \| brand \| prefer \| history \| snapshot \| regress \| rebaseline |
| `artifact` | string | no | label for the artifact (used for before/after pairing + history) |
| `content` | string | no | inline artifact content to critique |
| `path` | string | no | in-scope path to read the artifact from (alternative to content) |
| `kind` | string | no | artifact kind (inferred from path extension if omitted) |
| `project` | string | no | per-project taste model + memory scope (default = global) |
| `preference` | string | no | a durable preference signal to learn (action:prefer) |
| `name` | string | no | baseline name for visual snapshot/regress/rebaseline |
| `target` | string | no | screenshot target for snapshot/regress: an http(s) url or an in-scope file path |

_Safety-checked: sends a descriptor to the kernel for classification._

