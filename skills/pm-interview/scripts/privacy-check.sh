#!/usr/bin/env bash
set -u

skill_dir="${1:-.}"
failed=0

echo "Checking forbidden file types and private-data paths..."
if find "$skill_dir" -path "$skill_dir/.git" -prune -o -type f \( -name '.DS_Store' -o -name '*.log' -o -name '*.pdf' -o -name '*.docx' \) -print | grep -q .; then
  find "$skill_dir" -path "$skill_dir/.git" -prune -o -type f \( -name '.DS_Store' -o -name '*.log' -o -name '*.pdf' -o -name '*.docx' \) -print
  failed=1
fi

echo "Checking likely secrets, personal identifiers, and private links..."
pattern='(/Users/|https://[^ ]*feishu\.(cn|com)/(wiki|docx|drive|base|sheets)|https://[^ ]*larksuite\.com/(wiki|docx|drive|base|sheets)|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|(^|[^0-9])1[3-9][0-9]{9}([^0-9]|$)|(access[_-]?token|refresh[_-]?token|client[_-]?secret)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_\-\.]{16,})'
if rg -n -i --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!package-lock.json' --glob '!privacy-check.sh' "$pattern" "$skill_dir"; then
  failed=1
fi

if [ "$failed" -ne 0 ]; then
  echo "Privacy check failed. Review every match before publishing."
  exit 1
fi

echo "Privacy check passed. Manual review is still required."
