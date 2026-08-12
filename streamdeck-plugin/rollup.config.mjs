import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import path from "node:path";
import url from "node:url";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";

/**
 * Mirrors the official @elgato/cli Node template:
 *  - bundles src/plugin.ts (and ws) into one ESM file at <plugin>.sdPlugin/bin/plugin.js
 *  - emits a tiny bin/package.json with {"type":"module"} so Node runs the output as ESM
 */
const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "com.fluffybacon.deckcraft-hotbar.sdPlugin";

export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    // Emit a sourcemap (boolean true) so @rollup/plugin-typescript's mapped output is honoured;
    // only keep the inline file map while watching to avoid shipping maps in release builds.
    sourcemap: isWatching ? true : false,
    sourcemapPathTransform: (relativeSourcePath, sourcemapPath) =>
      url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href,
  },
  plugins: [
    {
      name: "watch-externals",
      buildStart() {
        this.addWatchFile(`${sdPlugin}/manifest.json`);
      },
    },
    typescript({ sourceMap: isWatching, inlineSources: isWatching, mapRoot: isWatching ? "./" : undefined }),
    nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
    {
      name: "emit-module-package-file",
      generateBundle() {
        this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
      },
    },
    {
      // Ship the icon extractor inside the plugin so a packaged install can generate item art
      // on first launch, with no repo checkout and no terminal. See src/icons/auto-extract.ts.
      name: "copy-icon-extractor",
      writeBundle() {
        const dest = `${sdPlugin}/tools`;
        mkdirSync(dest, { recursive: true });
        copyFileSync("scripts/extract-item-icons.mjs", `${dest}/extract-item-icons.mjs`);
        // tools/ needs its own ESM marker: bin/package.json does not apply to sibling folders.
        writeFileSync(`${dest}/package.json`, `{ "type": "module" }`);
      },
    },
  ],
};
