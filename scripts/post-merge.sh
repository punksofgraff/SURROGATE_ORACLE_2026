#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Restore Claude Code auth symlink if container was recycled
if [ ! -e "$HOME/.claude" ] && [ -d "/home/runner/workspace/.claude-session" ]; then
  ln -s /home/runner/workspace/.claude-session "$HOME/.claude"
  echo "✓ Claude Code auth restored"
fi
