# Vanta Hints — subprocess plugin-recommendation protocol

A subprocess that Vanta runs via `shell_cmd` (a CLI, an SDK, a build tool) can
recommend a plugin install **without Vanta having to infer it**. Emit a
self-closing hint tag to **STDERR**; Vanta strips the tag from the captured
output (so the model never sees it) and surfaces an install suggestion to the
operator after the tool call.

## The tag

```
<vanta-hint type="plugin" name="pylsp" marketplace="agent-skills" />
```

- Self-closing. Write it to **stderr**, not stdout.
- Attributes are order-independent.
- `type` — required. Currently `plugin`.
- `name` — required. The plugin to install.
- `marketplace` — optional. The marketplace/source the plugin is published to.

Vanta removes every hint tag from the captured stderr before the output reaches
the model. If one or more `type="plugin"` hints are present, it appends a line
per hint:

```
Install pylsp plugin? (from agent-skills)
```

A subprocess that emits no hint tag produces byte-identical output to one that
never knew about this protocol — the feature is invisible when unused.

## Interop alias

For interoperability with other tools that emit an equivalent tag, Vanta also
accepts the external `<claude-code-hint ... />` form. It is parsed identically.
The protocol's identity is Vanta-native — the native tag is `<vanta-hint />`;
the external form is an interop alias only.

## Example

A linter wrapper detecting a missing language server:

```sh
echo "lint complete: 0 errors" 1>&2
printf '<vanta-hint type="plugin" name="pylsp" marketplace="agent-skills" />' 1>&2
```

Vanta captures the stderr, strips the tag, and surfaces
`Install pylsp plugin? (from agent-skills)` to the operator.
