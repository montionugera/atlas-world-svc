---
name: vfx-shader-godot
description: Author, budget, optimize, and verify Godot 4.7 Forward+ `.gdshader` shaders, `GPUParticles3D` systems, and VFX meshes/textures for `atlas-world-svc` (`game-client/`). Grounded in all 9 live shaders under `game-client/assets/shaders/`, `MaroBellVerify.cs` particle setup, VFX texture atlas/dimension rules (`<= 1024 px`, flagging current `barrier.png` and `fireball.png` violations), and `scripts/godot-verify.sh` runtime probes.
---

# VFX & Shaders — Godot 4.7 Forward+ (`atlas-world-svc`)

Use this skill whenever authoring, editing, optimizing, or auditing `.gdshader` files, `ShaderMaterial` / `.tres` presets, `GPUParticles3D` emitters, or VFX meshes/textures under `game-client/`.

Every rule below is grounded in the **9** live `.gdshader` files in `game-client/assets/shaders/`, `game-client/assets/vfx/`, `game-client/src/World/MaroBellVerify.cs`, `game-client/src/World/EntityView.cs`, `game-client/src/World/TerrainElevation.cs`, and `scripts/godot-verify.sh`.

---

## 1. Godot 4.7 `.gdshader` Conventions (Grounded in Live Shaders)

All spatial shaders live in `game-client/assets/shaders/` (Forward+ renderer, `game-client/project.godot`). Reuse or parameterize these 9 live shaders before creating a new one:

| Shader (`game-client/assets/shaders/`) | `render_mode` | Purpose & Verified Pattern |
|---|---|---|
| `cel_shader.gdshader` | `blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon` | Base anime cel shading: `smoothstep` cel band + Genshin-style Fresnel rim + stepped specular highlight (`cel_material.tres`). |
| `outline.gdshader` | `blend_mix, cull_front, unshaded` | Inverted-hull outline (`EntityView.cs:243`): view-space clip-normal extrusion with **`v_view_dist < 2.0` `discard`** so close cameras never clip into black back-faces. |
| `weapon_glow.gdshader` | `blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon` | 5-tier enchant glow (`glow_tier` `0..5`: White, Blue, Red, Purple, Gold): `TIME * pulse_speed` Fresnel `EMISSION` boost. |
| `stylized_grass_floor.gdshader` | `blend_mix, depth_draw_opaque, cull_back, diffuse_toon, specular_toon` | Terrain SSOT shader (`TerrainElevation.cs:18`): **zero vertex displacement** (CPU mesh is SSOT), 3-octave FBM meadow, slope cliff bands (`38°` threshold), declarative `route_segments[16]`. |
| `maro_river_water.gdshader` | `blend_mix, depth_draw_never, cull_back, diffuse_burley, specular_schlick_ggx` | Self-contained procedural FBM ripples, shallow/deep absorption, pier/bank foam, `uniform float time_offset = 0.0`. |
| `maro_fountain_water.gdshader` | `blend_mix, depth_draw_never, cull_back, diffuse_burley, specular_schlick_ggx` | Concentric radial ripples (`sin(dist * ripple_frequency - t * ripple_speed)`), 8-lobe spillover foam, sun sparkles. |
| `maro_waterfall_ribbon.gdshader` | `blend_mix, depth_draw_never, cull_disabled, unshaded` | Translucent cyan-turquoise cascading ribbon with FBM sheet lobes (no periodic 1D stripes) and organic lateral edge fade. |
| `maro_plunge_foam.gdshader` | `blend_mix, depth_draw_never, cull_disabled, unshaded` | Boiling whitewater core with translucent cyan pockets and broken outward wave arcs. |
| `maro_wet_bank.gdshader` | `blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx` | Waterline darkening, capillary roughness drop (`0.86 -> 0.12`), and crevice moss band. |

### Mandatory Shader Authoring Rules
1. **Deterministic probe animation (`time_offset`):** Every time-animated VFX/water shader must expose `uniform float time_offset = 0.0;` and compute `float t = TIME + time_offset;` (matching `maro_*.gdshader`) so `EnvRenderPreGate.cs` and `MaroBellVerify.cs` can step frames deterministically during automated visual delta checks.
2. **Translucent VFX render modes:** Use `depth_draw_never` on translucent water, ribbons, slashes, and additive/alpha VFX (`blend_mix` or `blend_add`); use `cull_disabled` only on double-sided ribbons/cards (`maro_waterfall_ribbon.gdshader`, `maro_plunge_foam.gdshader`).
3. **Uniform annotations:** Always annotate color uniforms with `: source_color`, numeric tuning knobs with `: hint_range(min, max)`, and texture samplers with `: source_color, filter_linear_mipmap` (or `repeat_enable` for scrolling noise).
4. **No duplicate terrain displacement:** Never displace terrain vertices in `.gdshader` — `TerrainElevation.cs` is the CPU/GPU height SSOT.
5. **Procedural noise budget:** Keep in-shader procedural FBM capped at **`<= 3` octaves** (`for (int k = 0; k < 3; k++)`, as in all `maro_*.gdshader` and `stylized_grass_floor.gdshader`) to preserve mobile/laptop fragment budgets.

---

## 2. `GPUParticles3D` Authoring & Mobile/Laptop Budget Caps

### Current Repo Baseline
- `.tscn` scenes currently contain **`0` `GPUParticles3D` nodes**; programmatic `GpuParticles3D` authoring is established in **`game-client/src/World/MaroBellVerify.cs:1793-1836`** (`4` M4 waterfall mist & fountain splash emitters: `Amount = 40`, `Lifetime = 2.0`, `QuadMesh` `0.32×0.32 m`, unshaded `StandardMaterial3D` with `Transparency = Alpha`, `VertexColorUseAsAlbedo = true`, `BillboardMode = Particles`).
- Static VFX meshes in `game-client/assets/vfx/` (`projectile-arrow.glb` 224 tris / 4 mats, `projectile-melee.glb` 872 tris / 5 mats, `projectile-spear.glb` 1,202 tris / 4 mats; `zones/zone-{damage,freeze,impulse-caster,stun}.glb` 384 tris / 1 mat each) are registered under `kind: "vfx"` in `game-client/assets/manifest.json` (11 entries). **Validator gap:** `atelier/asset-forge/validate.mjs` currently skips all 11 `vfx` entries as `unknown kind 'vfx'`.

### Particle & Overdraw Budget Caps (Forward+ Mobile / Laptop)

| Metric | Ambient / Env Emitter | Combat Burst / Skill VFX | Hard Cap / Rule |
|---|---|---|---|
| **Particles per emitter (`Amount`)** | `<= 40–60` (`MaroBellVerify.cs:1815` uses `40`) | `<= 80–120` (`OneShot = true`) | `<= 400` concurrent active particles on screen |
| **Draw pass mesh** | Single `QuadMesh` (`1` draw pass) | `QuadMesh` or low-poly ribbon/cone (`<= 512 tris`) | `1` material per emitter; never shadow-cast (`CastShadow = Off`) |
| **Overdraw (screen fill)** | Soft alpha (`<= 0.35`), compact quad (`0.3–1.2 m`) | Brief peak (`<= 0.4 s` hitstop/burst) | `<= 3` stacked full-size translucent layers over camera center |
| **Lifecycle & Culling** | `FixedFps = 30`, `VisibilityRangeEnd <= 42 m` | `OneShot = true`, free/pool on `Finished` | Always set explicit `VisibilityAabb` so off-screen emitters cull |
| **Frame-time target** | Uncapped M4 water + mist `<< 25 ms` | Zero shader compilation hitch (pre-warm in scene) | Verify via `MaroBellVerify.cs` GPU profile (`RunM4UncappedGpuProfile`) |

---

## 3. VFX Texture Atlas & Dimension Rules (With Current Violations)

### Hard Texture Rules (`game-client/assets/vfx/`)
1. **Max edge `<= 1024 px`, power-of-two (`256`, `512`, `1024`)** — matches `forge.config.json` `maxTextureSize: 1024`.
2. **Flipbook / sprite atlases:** pack multi-frame fire, hit-sparks, or runes into a single square power-of-two atlas (`512×512` or `1024×1024`, uniform `4×4` or `8×8` grid) driven by `ParticlesAnimHFrames` / `ParticlesAnimVFrames` on `StandardMaterial3D` or UV-cell stepping in `.gdshader`.
3. **Import settings (`.png.import`):** use `compress/mode=2` (VRAM Compressed: S3TC/BPTC desktop, ETC2 mobile) and `mipmaps/generate=true` for 3D world/billboard VFX textures to eliminate shimmer and cut VRAM ~4–6×. Reserve `compress/mode=0` only for tiny (`<= 256 px`) alpha-critical masks if compression banding is visible.
4. **VFX GLB rules:** plain glTF 2.0 `.glb` (`<= 1,200 tris`, `1` material target — consolidate the legacy `4–5` material counts on `projectile-*.glb` on touch), `snake_case` filenames, **no** Draco / `KHR_mesh_quantization` / `EXT_meshopt_compression`.

### Verified Current Violations in `game-client/assets/vfx/`
Audit every existing file before adding new ones; **fix these before shipping VFX changes**:

| File | Current Size & Dimensions | `.png.import` Mode | Violation |
|---|---:|---|---|
| `game-client/assets/vfx/barrier.png` | `571 KB` · **`1280×1280`** | `compress/mode=0`, `mipmaps=false` | **Exceeds `1024 px` cap**, non-PoT, lossless, no mipmaps |
| `game-client/assets/vfx/fireball.png` | **`3.12 MB`** · **`2048×1792`** | `compress/mode=0`, `mipmaps=false` | **Exceeds `1024 px` cap & `1 MiB`**, non-PoT, lossless, no mipmaps |
| `game-client/assets/vfx/explosion.png` | `369 KB` · `1024×1024` | `compress/mode=0`, `mipmaps=false` | Lossless `mode=0` & `mipmaps=false` |
| `game-client/assets/vfx/magic_rune.png` | `417 KB` · `512×512` | `compress/mode=0`, `mipmaps=false` | Lossless `mode=0` & `mipmaps=false` |

---

## 4. Runtime Verification (`scripts/godot-verify.sh` & Local Audits)

**Never** run bare PATH `godot` to verify C# scenes or shaders — the non-mono binary prints `"Can't load script"` and still exits `0` (`scripts/godot-verify.sh:3-4`). Always run through `scripts/godot-verify.sh`:

```bash
# 1. Static texture/import & manifest drift checks (fast, read-only)
python3 .agents/skills/godot-asset-integration/scripts/audit_godot_imports.py
node scripts/check_asset_manifest.mjs

# 2. Verify VFX PNG dimensions stay <= 1024 px
for f in game-client/assets/vfx/*.png; do
  printf '%s: ' "$(basename "$f")"
  sips -g pixelWidth -g pixelHeight "$f" | awk '/pixelWidth/{w=$2}/pixelHeight/{h=$2}END{print w"x"h}'
done

# 3. Godot 4.7.2 Mono headless shader & environment pre-gate (checks shader compile + time_offset delta)
scripts/godot-verify.sh ATLAS_VERIFY_ENV_PREGATE '^\[EnvRenderPreGateVerify\] VERDICT PASS$'

# 4. Maro Bell M4 water shaders + 4 GPUParticles3D mist/splash emitters + uncapped GPU profile
scripts/godot-verify.sh ATLAS_VERIFY_MARO_BELL '^\[MaroBellVerify\] VERDICT PASS$'

# 5. EntityView shader/outline binding probe (cel_shader + outline.gdshader)
scripts/godot-verify.sh ATLAS_VERIFY_ENTITYVIEW '^\[EntityViewVerify\] RESULT: PASS'
```

- **Windowed visual verification:** headless Godot renders no pixels; for shader/particle visual review, render frames in windowed mode (`ATLAS_RENDER_MARO_BELL=<out_dir>` for M4 water/mist) and inspect downscaled (`<= 1024 px`) captures via `atlas-3d` MCP `image_crop_inspect` / `vision_qa` rather than reading full-size PNGs in main context.
