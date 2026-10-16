#!/usr/bin/env bash
# Publishes the useful tail of a log as GitHub annotations so failures can be
# read through the checks API. Progress noise (Compiling/Downloaded...) is
# dropped and the rest is split into 4000-character chunks (GitHub's limit).
# usage: ci-annotate.sh <error|notice> <title> <logfile> [max_chunks]
level="$1"; title="$2"; file="$3"; max="${4:-8}"
[ -f "$file" ] || exit 0
filtered=$(sed -e 's/\x1b\[[0-9;]*m//g' "$file" \
  | grep -Ev '^\s*(Downloaded|Downloading|Compiling|Locking|Adding|Updating|Fresh|Checking|Blocking|Packaging|Installing|Fetching)\b' \
  | tail -c $((max * 3900)))
total=${#filtered}
i=0; part=1
while [ $i -lt $total ] && [ $part -le $max ]; do
  chunk="${filtered:$i:3900}"
  chunk="${chunk//'%'/'%25'}"
  chunk="${chunk//$'\r'/'%0D'}"
  chunk="${chunk//$'\n'/'%0A'}"
  echo "::${level} title=${title} (${part})::${chunk}"
  i=$((i + 3900)); part=$((part + 1))
done
