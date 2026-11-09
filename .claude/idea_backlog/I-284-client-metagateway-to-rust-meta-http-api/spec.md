---
title: "Client MetaGateway to Rust meta HTTP API (remove NakamaClient NuGet dependency)"
id: I-284
status: idea
---

# I-284 Client MetaGateway to Rust meta HTTP API

## Goal
Switch the Godot C# client (`MetaGateway.cs` and `Config.cs`) from the `NakamaClient` NuGet SDK to direct HTTP calls against the built-in Rust meta `/v2/*` HTTP API (`server-rs/src/meta/http.rs`) using `System.Net.Http.HttpClient`, and remove the `NakamaClient` package reference from `game-client/GameClient.csproj`.

## Scope
- `game-client/GameClient.csproj`: remove `<PackageReference Include="NakamaClient" ... />`.
- `game-client/src/Core/Config.cs`: replace `Nakama*` comments with Rust meta HTTP gateway comments (keep property names or clean aliases if needed by callers, and default port/host pointing at the Rust meta HTTP gateway).
- `game-client/src/Meta/MetaGateway.cs`: remove `using Nakama;`, `Nakama.Client`, `ISession`, `ISocket`. Implement device auth (`POST /v2/account/authenticate/device` + `GET /v2/account` or JWT `sub` decode), storage read (`POST /v2/storage`), and RPC (`POST /v2/rpc/{rpcId}`) via `System.Net.Http.HttpClient` + `System.Text.Json`, preserving all existing Godot signals (`AuthReady`, `AuthFailed`, `DocLoaded`, `RpcResult`, `NotificationReceived`) and `CallDeferred` main-thread dispatch.
- Update stale Nakama doc comments in `game-client/src/Core/GameRoot.cs`, `game-client/src/Meta/MetaJson.cs`, `game-client/src/UI/MetaIds.cs`, `game-client/src/UI/Panels/LoadoutPanel.cs`, `game-client/src/UI/Panels/MetaPanel.cs`.

## Acceptance criteria
- [ ] `NakamaClient` is removed from `game-client/GameClient.csproj` and `grep -rn "using Nakama" game-client/src/` returns empty.
- [ ] `MetaGateway.cs` authenticates device, reads storage docs, and invokes RPCs against `/v2/*` over `HttpClient`.
- [ ] `dotnet build game-client/GameClient.csproj` succeeds with 0 errors.
