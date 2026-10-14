import os
import shutil
import subprocess

APP_PATH = "/Users/pasitnusso/Library/Developer/Xcode/DerivedData/AtlasWorld-evpqvpjljeivgubbtkcyksiyyvvg/Build/Products/Debug-iphoneos/AtlasWorld.app"
ENTITLEMENTS = "/Users/pasitnusso/Library/Developer/Xcode/DerivedData/AtlasWorld-evpqvpjljeivgubbtkcyksiyyvvg/Build/Intermediates.noindex/AtlasWorld.build/Debug-iphoneos/AtlasWorld.build/AtlasWorld.app.xcent"
SIGN_ID = "FAAED654216EC342F4A7F95205F44F7B4F4EB02C"

PCK_SRC = "/Users/pasitnusso/workspace/repos/atlas-world-svc/game-client/builds/AtlasWorld.pck"
PUBLISH_DIR = "/Users/pasitnusso/workspace/repos/atlas-world-svc/game-client/.godot/mono/temp/bin/ExportRelease-ios-arm64/ios-arm64/publish"
DYLIB_SRC = os.path.join(PUBLISH_DIR, "GameClient.dylib")
ICU_SRC = os.path.join(PUBLISH_DIR, "icudt.dat")

print(f"1. Copying PCK to {APP_PATH}...")
shutil.copy2(PCK_SRC, os.path.join(APP_PATH, "AtlasWorld.pck"))
shutil.copy2(PCK_SRC, "/Users/pasitnusso/workspace/repos/atlas-world-svc/game-client/builds/ios_device/AtlasWorld.pck")

print("2. Copying dylib & icudt.dat to app bundle destinations...")
os.makedirs(os.path.join(APP_PATH, "Frameworks"), exist_ok=True)
os.makedirs(os.path.join(APP_PATH, "dylibs"), exist_ok=True)

destinations = [
    os.path.join(APP_PATH, "Frameworks"),
    os.path.join(APP_PATH, "dylibs"),
    APP_PATH,
]

for d in destinations:
    shutil.copy2(DYLIB_SRC, os.path.join(d, "GameClient.dylib"))
    shutil.copy2(ICU_SRC, os.path.join(d, "icudt.dat"))

print("3. Signing dylibs individually...")
for d in destinations:
    target_dylib = os.path.join(d, "GameClient.dylib")
    cmd = ["codesign", "--force", "--sign", SIGN_ID, "--timestamp=none", target_dylib]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error signing {target_dylib}: {res.stderr}")
    else:
        print(f"Signed {target_dylib} OK")

print("4. Re-signing AtlasWorld.app with entitlements...")
cmd = [
    "codesign",
    "--force",
    "--sign", SIGN_ID,
    "--entitlements", ENTITLEMENTS,
    "--generate-entitlement-der",
    "--timestamp=none",
    APP_PATH,
]
res = subprocess.run(cmd, capture_output=True, text=True)
print("Codesign output:", res.stdout, res.stderr)
print("Return code:", res.returncode)
if res.returncode == 0:
    print("SUCCESS: AtlasWorld.app successfully embedded and signed!")
else:
    exit(1)
