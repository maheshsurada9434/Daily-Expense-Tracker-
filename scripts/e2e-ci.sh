#!/usr/bin/env bash
# Runs Playwright; on failure, reports each failing test's page snapshot as its own small annotation.
npm run e2e && exit 0
for f in test-results/*/error-context.md; do
  [ -f "$f" ] || continue
  msg="$(grep -v '^\s*$' "$f" | head -c 3500 | iconv -c -f utf-8 -t utf-8 | sed -e ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
  echo "::error title=snapshot $(basename "$(dirname "$f")" | cut -c1-60)::${msg}"
done
exit 1
