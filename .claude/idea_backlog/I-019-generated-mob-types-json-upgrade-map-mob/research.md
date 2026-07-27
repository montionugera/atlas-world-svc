# Generated mob-types.json → upgrade map mobType check from WARN to hard-fail: emit a machine-readable list of valid mob ids from colyseus-server mob definitions (mirror gen-asset-keys codegen), have check_content.mjs read it so a typo in a content map mobSpawnAreas[].mobType (and faction/quest mob refs) is a hard FAIL instead of a silent WARN — closes the silent-empty-spawn risk in authored maps — research notes

(prior art, related issues, open questions)
