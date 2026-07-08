# Atlas World Contracts

Generated C# schema models for the Atlas World Colyseus server.

> **Auto-generated — do not edit by hand.** Everything in `Runtime/` is produced by
> `colyseus-server`'s codegen (`npm run client:csharp`) from `src/schemas/*.ts`.
> Edits will be overwritten on the next generation and will fail the CI drift check.

## Install (Unity Package Manager)

Add to your Unity project's `Packages/manifest.json`, pinned to a released tag:

```json
"com.atlasworld.contracts": "https://github.com/montionugera/atlas-world-svc.git?path=colyseus-server/generated/csharp#contracts-v0.1.0"
```

## Runtime dependency

These are **models only**. Decoding/networking comes from the official
**Colyseus Unity SDK**, which you must add separately. The SDK version must be
wire-compatible with the server's `@colyseus/schema` (currently generated with
**`@colyseus/schema` 3.0.x**). Confirm the matching Colyseus Unity SDK release for
schema v3 before pinning — see https://github.com/colyseus/colyseus-unity-sdk/releases.

## Contents

- `Runtime/*.cs` — generated `@colyseus/schema` models, namespace `AtlasWorld.Schema`
- `AtlasWorld.Contracts.asmdef` — assembly definition
- `package.json` — UPM manifest

## Regenerating

From `colyseus-server/`:

```bash
npm run client:csharp
```
