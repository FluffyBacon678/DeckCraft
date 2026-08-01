#!/usr/bin/env bash
# Live integration test for the mod's networking layer — no Minecraft, no Stream Deck needed.
#
#   bash nettest/run-net-test.sh
#
# Starts a fake Stream Deck bridge (Node) and runs DeckCraftNetTest against it using the mod's
# REAL compiled DeckCraftConnectionClient + ProtocolJson classes. Requires `./gradlew build` first.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
PLUGIN="$(cd "$ROOT/../streamdeck-plugin" && pwd)"
PORT="${PORT:-38251}"

# --- locate a JDK 21 (the default `java` on this machine may be older) -------
JDK="${JAVA_HOME:-}"
if [ -z "$JDK" ] || [ ! -x "$JDK/bin/javac" ]; then
  for c in "$HOME"/.jdks/jdk-21* "/c/Program Files/Java/jdk-21"* "/c/Program Files/Eclipse Adoptium/jdk-21"*; do
    [ -x "$c/bin/javac" ] && JDK="$c" && break
  done
fi
if [ -z "$JDK" ] || [ ! -x "$JDK/bin/javac" ]; then
  echo "ERROR: need a JDK 21. Set JAVA_HOME." >&2; exit 1
fi

# --- classpath (Windows-style paths: javac/java here are Windows binaries) ---
towin() { echo "$1" | sed -E 's#^/([a-zA-Z])/#\1:/#'; }
GSON="$(find "$HOME/.gradle/caches/modules-2/files-2.1/com.google.code.gson" -name 'gson-*.jar' ! -name '*sources*' 2>/dev/null | sort | tail -1)"
SLF4J="$(find "$HOME/.gradle/caches/modules-2/files-2.1/org.slf4j" -name 'slf4j-api-*.jar' ! -name '*sources*' 2>/dev/null | sort | tail -1)"
CLASSES="$ROOT/build/classes/java/main"
OUT="$HERE/out"

if [ ! -d "$CLASSES" ]; then echo "ERROR: run ./gradlew build first (no compiled classes)." >&2; exit 1; fi
if [ -z "$GSON" ] || [ -z "$SLF4J" ]; then echo "ERROR: gson/slf4j not in the Gradle cache." >&2; exit 1; fi

SEP=";"; case "$(uname -s)" in Linux*|Darwin*) SEP=":";; esac
CP="$(towin "$CLASSES")$SEP$(towin "$GSON")$SEP$(towin "$SLF4J")"

mkdir -p "$OUT"
"$JDK/bin/javac" -cp "$CP" -d "$(towin "$OUT")" "$(towin "$HERE/DeckCraftNetTest.java")" || exit 1

# --- start the bridge (run from the plugin dir so `ws` resolves) -------------
LOG="$HERE/bridge.log"
( cd "$PLUGIN" && node scripts/java-net-bridge.mjs "$PORT" ) > "$LOG" 2>&1 &
BRIDGE_PID=$!
trap 'kill $BRIDGE_PID 2>/dev/null' EXIT

for _ in $(seq 1 60); do grep -q "listening" "$LOG" 2>/dev/null && break; sleep 0.1; done
if ! grep -q "listening" "$LOG" 2>/dev/null; then echo "ERROR: bridge failed to start:"; cat "$LOG"; exit 1; fi

"$JDK/bin/java" -cp "$(towin "$OUT")$SEP$CP" DeckCraftNetTest "$PORT"
JAVA_EXIT=$?

sleep 1
echo
echo "=== what the bridge actually received from the mod ==="
grep "BRIDGE_RESULT" "$LOG" || tail -5 "$LOG"
exit $JAVA_EXIT
