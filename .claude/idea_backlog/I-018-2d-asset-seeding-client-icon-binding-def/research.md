# 2D asset seeding + client icon binding (deferred F-011 phases 2-5, NEEDS Godot): seed CC0 icons for every ItemsById/SkillsById id (from contracts/content/items.json+skills.json, not MetaIds.cs) via intake2d + godot --headless --import to generate real .import sidecars; coverage test; storybook atlas-JSON path wiring (index.html L1115); client CatalogLoader key->Texture2D + SkillTile/InventoryTile TextureRect binding; ninepatch/theme baked-preview via Godot. Blocked on local Godot .NET binary — research notes

(prior art, related issues, open questions)
