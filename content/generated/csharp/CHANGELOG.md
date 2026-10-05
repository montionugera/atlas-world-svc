# Changelog

## 0.1.0 — baseline generated models

- First generated release of the Atlas World C# schema contracts.
- 100% generated from `colyseus-server/src/schemas/*.ts` via `schema-codegen` (`@colyseus/schema` 3.0.x), namespace `AtlasWorld.Schema`.
- Clean UPM package: `AtlasWorld.Contracts.asmdef`, single `package.json`; removed the prior hand-written client, `.csproj`, and committed `obj/` build artifacts.
