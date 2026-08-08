import { ASSET_ROOT } from "./state.mjs";

export function resolveSceneSrc(scenePath) {
  return ASSET_ROOT + scenePath.replace(/^res:\/\//, "");
}

export function filenameOf(path) {
  return path.split("/").pop();
}

// The HEAD-request size probe that used to live here is gone (F-038).
//
// It issued one HEAD per card to read Content-Length — 653 of them at a
// concurrency of 8, of which only 198 had drained 15 seconds after load, all
// competing with real asset traffic to display a number the build already
// knew. Sizes now come from game-client/assets/.thumbs/index.json via
// js/data/thumbs.mjs sizeTextFor(), instantly and exactly.
