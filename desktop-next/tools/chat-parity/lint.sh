#!/bin/sh
# Lint and format the files this track changed. The desktop-next install carries no eslint stack,
# so point LINT_TOOLS at a directory with eslint, its plugins and prettier installed (see README).
# usage: LINT_TOOLS=/path tools/chat-parity/lint.sh [--fix]
set -e
cd "$(dirname "$0")/../../apps/desktop"
FILES=$(git diff --name-only --diff-filter=AM claude/desktop-next-20261013...HEAD -- . | sed 's|desktop-next/apps/desktop/||' | grep -E '\.(ts|tsx)$' | grep -v '^tools' || true)
"$LINT_TOOLS/node_modules/.bin/prettier" --config "$LINT_TOOLS/prettierrc.json" ${1:+--write} ${1:---check} $FILES
"$LINT_TOOLS/node_modules/.bin/eslint" -c "$LINT_TOOLS/apps/desktop/eslint.config.mjs" $1 $FILES
