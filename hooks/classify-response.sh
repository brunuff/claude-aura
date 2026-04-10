#!/bin/bash
# Aura Classifier — Stop Hook
# Extracts last assistant message from transcript, runs text classifier,
# writes output to /tmp/aura-classifier.json (or AURA_CLASSIFIER_OUTPUT).

set -euo pipefail

INPUT=$(cat)

# Read transcript path from hook stdin
TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // empty')
if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
  exit 0
fi

# Find the project root (where dist/classify-cli.js lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI="$PROJECT_ROOT/dist/classify-cli.js"

if [ ! -f "$CLI" ]; then
  exit 0
fi

# Extract last assistant message text from the JSONL transcript.
# Read from the end to find the most recent assistant message.
TEXT=$(tac "$TRANSCRIPT" | while IFS= read -r line; do
  role=$(echo "$line" | jq -r '.role // empty' 2>/dev/null)
  if [ "$role" = "assistant" ]; then
    echo "$line" | jq -r '
      [.message.content[]? | select(.type == "text") | .text] | join("\n")
    ' 2>/dev/null
    break
  fi
done)

if [ -z "$TEXT" ]; then
  exit 0
fi

# Run classifier and write output file
echo "$TEXT" | node "$CLI"
