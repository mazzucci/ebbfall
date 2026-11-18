#!/bin/sh
# One round of "play against Claude" (spike): spike/round.sh PLAN.json SEED OUT.json [more duel flags]
# Seat 0 is Hard's AI steered by PLAN.json (spike/PLAN_VOCAB.md), seat 1 plain Hard; Kingdom vs Expedition on a
# 96x96 Standard map, a 30-minute cap, unless the extra flags say otherwise (--map, --size, --race, --vs-race, --cap).
# Prints what the plan had adjusted, then one line: the result, the summary's size and the wall time.
set -e
[ $# -ge 3 ] || { echo "usage: spike/round.sh PLAN.json SEED OUT.json [--race Expedition --vs-race Kingdom ...]" >&2; exit 2; }
plan=$(realpath "$1") seed=$2 out=$(realpath -m "$3")
shift 3
cd "$(dirname "$0")/.."
export PATH="$HOME/.cargo/bin:$PATH"
cargo build -q --release -p endfall-lab
mkdir -p /tmp/claude-1000
exec flock /tmp/claude-1000/ebbfall-lab.lock ./target/release/endfall-lab duel \
  --plan "$plan" --seed "$seed" --map Standard --size 96 --race Kingdom --vs-race Expedition --out "$out" "$@"
