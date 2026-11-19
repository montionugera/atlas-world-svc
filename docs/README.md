# Atlas World Service — Docs

**Read in order (flow):**

| Doc | Description |
|-----|-------------|
| [event-flow.spec.md](./event-flow.spec.md) | Room events: emitters and subscribers |
| [spawn.spec.md](./spawn.spec.md) | Mob, player, NPC spawn and removal |
| [player.spec.md](./player.spec.md) | Player state, input, movement |
| [mob-movement.spec.md](./mob-movement.spec.md) | Mob steering, separation, heading |
| [attack.spec.md](./attack.spec.md) | Melee, projectiles, parry |
| [ai.spec.md](./ai.spec.md) | AI behaviors and targeting |
| [companion.spec.md](./companion.spec.md) | Companion lifecycle and API |
| [zone-effect.spec.md](./zone-effect.spec.md) | Zone/AoE effects: cast, duration, tick, trigger |
| [terrain.spec.md](./terrain.spec.md) | Terrain zones (ice/grass/mud/sand), friction, effect on speed |

**Other:**

| Doc | Description |
|-----|-------------|
| [PRODUCT.md](./PRODUCT.md) | Product overview and scope |
| [unit-contract.md](./unit-contract.md) | Canonical 1 game unit = 1 metre contract (F-185) |
| [asset-delivery-spec.md](./asset-delivery-spec.md) | 3D asset delivery spec (`.glb`, scale, axes, anims, licensing) |
| [asset-intake.md](./asset-intake.md) | Asset intake and license ledger process |
| [game-server.spec.md](./game-server.spec.md) | Overview, config, health, metrics (`server-rs/`) |
| [meta-systems.spec.md](./meta-systems.spec.md) | Meta persistence, inventory, progression |
| [networking.spec.md](./networking.spec.md) | Agones / `server-rs` exposure (HostPort, NodePort) |
| [research/](./research/) | Technical research notes and benchmarks |
| [superpowers/](./superpowers/) | Design specs, implementation plans, and backlog ideas |
| [worldbuilding/](./worldbuilding/) | World bible, town plans, and review sheets |

Convention: `module.topic.md`. Add new docs here.
