#!/usr/bin/env bash
# Publishes the tail of a log as a single GitHub annotation so failures can be
# read through the checks API (raw Actions logs are not always reachable).
# usage: ci-annotate.sh <error|notice> <title> <logfile>
level="$1"; title="$2"; file="$3"
[ -f "$file" ] || exit 0
msg=$(tail -c 30000 "$file" | sed -e 's/\x1b\[[0-9;]*m//g')
msg="${msg//'%'/'%25'}"
msg="${msg//$'\r'/'%0D'}"
msg="${msg//$'\n'/'%0A'}"
echo "::${level} title=${title}::${msg}"
