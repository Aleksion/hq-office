#!/bin/sh
# One machine's health as key=value: cores, load1, cpu_busy and mem_used (percent).
# Runs locally or over ssh (`ssh host sh -s < machine-stats.sh`). macOS and Linux.
# launchd gives a minimal PATH without /usr/sbin, so set the usual one first.
PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export PATH
cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)
if [ "$(uname)" = "Darwin" ]; then
  load1=$(sysctl -n vm.loadavg | awk '{print $2}')
  cpu_idle=$(top -l 2 -n 0 -s 1 | grep 'CPU usage' | tail -1 | sed -E 's/.* ([0-9.]+)% idle.*/\1/')
  total=$(sysctl -n hw.memsize)
  page=$(sysctl -n hw.pagesize)
  # free, inactive and speculative pages can be reclaimed, so they do not count as used
  reclaimable=$(vm_stat | awk '/Pages (free|inactive|speculative):/ {gsub("\\.", "", $NF); s += $NF} END {print s + 0}')
  mem_used=$(awk -v t="$total" -v f="$reclaimable" -v p="$page" 'BEGIN { printf "%.1f", (1 - f * p / t) * 100 }')
else
  load1=$(awk '{print $1}' /proc/loadavg)
  cpu_idle=$(top -bn2 -d1 | grep 'Cpu(s)' | tail -1 | sed -E 's/.* ([0-9.,]+) id.*/\1/' | tr , .)
  mem_used=$(free | awk '/Mem:/ { printf "%.1f", $3 / $2 * 100 }')
fi
# An empty reading is a failed sample, not a zero.
for v in "$load1" "$cpu_idle" "$mem_used"; do [ -n "$v" ] || { echo "sample incomplete" >&2; exit 1; }; done
cpu_busy=$(awk -v i="$cpu_idle" 'BEGIN { printf "%.1f", 100 - i }')
echo "cores=$cores load1=$load1 cpu_busy=$cpu_busy mem_used=$mem_used"
