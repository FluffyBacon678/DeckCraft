package com.fluffybacon.deckcraft.hotbar.setup;


import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Exercises the real bundled-installer extraction without a Minecraft runtime.
 *
 * Run from nettest/run-installer-test.sh, which puts a stand-in .streamDeckPlugin on the
 * classpath at deckcraft/ — exactly where Gradle's processResources places the real one — so this
 * verifies the resource path, the write, and idempotency on a second launch.
 */
public class InstallerTest {

    private static int pass = 0;
    private static int fail = 0;

    static void check(String name, boolean ok) {
        System.out.println((ok ? "PASS  " : "FAIL  ") + name);
        if (ok) pass++; else fail++;
    }

    public static void main(String[] args) throws Exception {
        Path dir = Files.createTempDirectory("deckcraft-installer-test");

        // ---- first launch: the file should be written ----
        Path first = StreamDeckPluginInstaller.extractTo(dir);
        check("extraction returns a path", first != null);
        check("file exists on disk", first != null && Files.exists(first));
        check("named com.fluffybacon.deckcraft-hotbar.streamDeckPlugin",
                first != null && first.getFileName().toString().equals("com.fluffybacon.deckcraft-hotbar.streamDeckPlugin"));
        long size = first != null ? Files.size(first) : -1;
        check("content was copied, not left empty (" + size + " bytes)", size > 0);

        // ---- second launch: must not re-copy or fail ----
        byte[] before = Files.readAllBytes(first);
        Path second = StreamDeckPluginInstaller.extractTo(dir);
        check("second call returns the same path", second != null && second.equals(first));
        check("content unchanged on re-launch", java.util.Arrays.equals(before, Files.readAllBytes(second)));

        // ---- creates its directory if missing ----
        Path nested = dir.resolve("does/not/exist/yet");
        Path deep = StreamDeckPluginInstaller.extractTo(nested);
        check("creates missing directories", deep != null && Files.exists(deep));

        // ---- unwritable target must degrade, not throw ----
        Path asFile = dir.resolve("a-file-not-a-dir");
        Files.writeString(asFile, "x");
        Path bad = StreamDeckPluginInstaller.extractTo(asFile);
        check("a bad target returns null instead of throwing", bad == null);

        System.out.println();
        System.out.println(pass + "/" + (pass + fail) + " installer checks passed");
        System.exit(fail == 0 ? 0 : 1);
    }
}
