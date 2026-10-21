#!/usr/bin/env bash
# Runs a command and, if it fails, also reports its output as one GitHub annotation so failures are readable
# from the Checks UI/API without downloading logs (last 3.5 KB, cleaned to valid UTF-8).   usage: scripts/ci-step.sh "<title>" <command...>
title="$1"; shift
log="$(mktemp)"
set -o pipefail
"$@" 2>&1 | tee "$log"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg="$(tail -c 3500 "$log" | iconv -c -f utf-8 -t utf-8 | sed -e ':a;N;$!ba;s/%/%25/g;s/\r//g;s/\n/%0A/g')"
  echo "::error title=${title} failed::${msg}"
fi
exit "$code"
