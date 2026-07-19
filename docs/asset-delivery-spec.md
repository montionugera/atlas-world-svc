# Asset Delivery Spec (for commissioned artists)

Deliver assets to this spec so they drop into the game with no rework. Questions → ask before starting.

## Format
- **glTF 2.0 binary (`.glb`)**, one file per asset (textures embedded).
- Also include the editable source (`.blend`) in a separate `source/` folder.

## Transform
- **Scale: 1 unit = 1 metre.** A standing humanoid ≈ 1.8u tall. Apply/freeze all transforms before export.
- **Forward axis: −Z** (Godot convention). **Up: +Y.**
- **Pivot/origin:** characters at the **feet** (on the ground plane, centered X/Z); props at the **center**.

## Geometry / materials
- Low-poly stylized to match the existing house style (Kenney/Quaternius family) unless briefed otherwise.
- Real-world proportions. Single material per object where possible; PBR base color + normal + ORM.
- Reasonable poly budget (state per-asset in the brief); no n-gons.

## Animations (characters)
- Root motion off; animate in place. Include at minimum: `idle`, `walk`, `run`, `attack`, `hit`, `death`.
- Name clips exactly those lowercase strings.

## Licensing
- Deliverables must be original or license-clean for **commercial** use. State the license in writing.

## Naming
- `snake_case`, descriptive: `spear_thrower.glb`, `rock_cluster_a.glb`. No spaces.
