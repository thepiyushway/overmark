#!/bin/sh
# Stand-in for macOS /usr/sbin/screencapture on Linux CI, so the zoom lens can be tested end to end.
# Logs its arguments and writes a fixed test-pattern image to the output path.
LOG="${OVERMARK_SCREENCAPTURE_LOG:-/tmp/overmark-screencapture.log}"
echo "$*" >> "$LOG"
for last; do :; done
cp "$(dirname "$(readlink -f "$0")")/zoom-pattern.jpg" "$last" 2>/dev/null || cp /usr/local/share/overmark/zoom-pattern.jpg "$last"
