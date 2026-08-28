#!/usr/bin/env bash
# Verifies the bundled Stream Deck plugin installer WITHOUT Minecraft, Gradle or a Fabric runtime.
#
#   bash nettest/run-installer-test.sh
#
# Stages a .streamDeckPlugin at deckcraft/ on the classpath — exactly where Gradle's
# processResources puts the real one — then runs StreamDeckPluginInstaller.extractTo against a
# temp directory. Covers the resource path, the copy, idempotency on a second launch, directory
# creation, and graceful failure.
#
# Useful in its own right, and essential when Gradle cannot run (it needs a loopback socket to
# fork its daemon, which some environments block).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$ROOT"

towin() { echo "$1" | sed -E 's#^/([a-zA-Z])/#\1:/#'; }

JDK="${JAVA_HOME:-}"
if [ -z "$JDK" ] || [ ! -x "$JDK/bin/javac" ]; then
  for c in "$HOME"/.jdks/jdk-21* "/c/Program Files/Java/jdk-21"* "/c/Program Files/Eclipse Adoptium/jdk-21"*; do
    [ -x "$c/bin/javac" ] && JDK="$c" && break
  done
fi
[ -x "$JDK/bin/javac" ] || { echo "ERROR: need a JDK 21. Set JAVA_HOME." >&2; exit 1; }

MC="$(towin "$PWD/$(ls .gradle/loom-cache/minecraftMaven/net/minecraft/*/*/*.jar 2>/dev/null | grep -v sources | head -1)")"
[ -n "$MC" ] || { echo "ERROR: no remapped Minecraft jar in .gradle/loom-cache — run a Gradle build once first." >&2; exit 1; }
SLF4J="$(towin "$(find "$HOME/.gradle/caches/modules-2/files-2.1/org.slf4j" -name 'slf4j-api-*.jar' ! -name '*sources*' 2>/dev/null | sort | tail -1)")"
LOADER="$(towin "$(find "$HOME/.gradle/caches/modules-2/files-2.1/net.fabricmc/fabric-loader" -name 'fabric-loader-*.jar' ! -name '*sources*' 2>/dev/null | sort | tail -1)")"
EX=""
for p in com.mojang/brigadier com.mojang/datafixerupper com.mojang/authlib com.google.guava/guava org.joml/joml com.mojang/logging; do
  j="$(find "$HOME/.gradle/caches/modules-2/files-2.1/$p" -name '*.jar' ! -name '*sources*' 2>/dev/null | sort | tail -1)"
  [ -n "$j" ] && EX="$EX$(towin "$j");"
done
FAPI="$(find .gradle/loom-cache/remapped_mods -name '*.jar' ! -name '*sources*' 2>/dev/null | while read -r f; do towin "$PWD/$f"; done | tr '\n' ';')"

OUT="$HERE/out-installer"
rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/res/deckcraft"
WOUT="$(towin "$OUT")"

# Prefer the real packaged plugin; fall back to a stand-in so the test still runs.
PLUGIN="$ROOT/../streamdeck-plugin/dist/com.fluffybacon.deckcraft-hotbar.streamDeckPlugin"
if [ -f "$PLUGIN" ]; then
  cp "$PLUGIN" "$OUT/res/deckcraft/"
  echo "using the real packaged plugin ($(wc -c < "$PLUGIN") bytes)"
else
  head -c 4096 /dev/urandom > "$OUT/res/deckcraft/com.fluffybacon.deckcraft-hotbar.streamDeckPlugin"
  echo "NOTE: streamdeck-plugin/dist not built — using a 4 KB stand-in"
fi

CP="$MC;$LOADER;$SLF4J;$EX$FAPI"
"$JDK/bin/javac" -nowarn -proc:none -cp "$CP" -d "$WOUT/classes" \
  src/main/java/com/fluffybacon/deckcraft/hotbar/util/DeckCraftLogger.java \
  src/main/java/com/fluffybacon/deckcraft/hotbar/setup/StreamDeckPluginInstaller.java || exit 1
"$JDK/bin/javac" -nowarn -proc:none -cp "$WOUT/classes;$SLF4J" -d "$WOUT/classes" \
  "$HERE/InstallerTest.java" || exit 1

"$JDK/bin/java" -cp "$WOUT/classes;$WOUT/res;$CP" \
  com.fluffybacon.deckcraft.hotbar.setup.InstallerTest 2>&1 | grep -v '^SLF4J'
exit "${PIPESTATUS[0]}"
