import { spawnSync } from "node:child_process";
export function rasterize({
  svgPath,
  pngPath,
  width = 2000,
  background = "#f3e7ce",
}) {
  const probe = spawnSync("rsvg-convert", ["--version"], { stdio: "pipe" });
  if (probe.error || probe.status !== 0) {
    return {
      ok: false,
      skipped: true,
      message:
        "rsvg-convert not found — PNG skipped. Install librsvg (brew install librsvg). Do NOT substitute ImageMagick: without the librsvg delegate it silently drops every stroke.",
    };
  }
  const run = spawnSync(
    "rsvg-convert",
    ["-w", String(width), "-b", background, svgPath, "-o", pngPath],
    { stdio: "pipe" },
  );
  if (run.status !== 0)
    return { ok: false, skipped: false, message: String(run.stderr) };
  return { ok: true, skipped: false, message: `wrote ${pngPath}` };
}
