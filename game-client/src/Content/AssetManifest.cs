using System;
using System.Collections.Generic;
using System.Text.Json;
using Godot;

namespace AtlasWorld.Client.Content
{
    /// <summary>
    /// One resolved asset mapping: the server type id (the dictionary key in the
    /// manifest) plus where its content lives and how it was sourced. All string
    /// fields default to empty (never null) so downstream code — the registry and the
    /// CI drift-gate — can read them without null-guards. A missing/blank field is a
    /// data problem the drift-gate reports, not a crash here.
    /// </summary>
    public sealed class AssetEntry
    {
        /// <summary>The server type id this entry maps (e.g. <c>mob:spear_thrower</c>).</summary>
        public string TypeId { get; init; } = "";

        /// <summary><c>res://…</c> path to the PackedScene to instance for this type.</summary>
        public string Scene { get; init; } = "";

        /// <summary>Provenance of the asset: <c>ai | market | commission</c>.</summary>
        public string Source { get; init; } = "";

        /// <summary>License string recorded at intake (e.g. <c>CC0</c>).</summary>
        public string License { get; init; } = "";

        /// <summary>Resolution tier: <c>seed | bespoke</c>.</summary>
        public string Tier { get; init; } = "";

        /// <summary>Content class: <c>character | prop | vfx | audio</c>.</summary>
        public string Kind { get; init; } = "";

        /// <summary>
        /// Optional per-entry override of the shared logical-state → clip-name animation
        /// map (see <c>AnimationController.DefaultClipMap</c>), e.g. <c>{"attack": "attack-kick-right"}</c>.
        /// Empty (never null) when the manifest entry has no <c>anims</c> object — the
        /// controller then falls back to the shared Kenney default for every state.
        /// </summary>
        public IReadOnlyDictionary<string, string> Anims { get; init; } = new Dictionary<string, string>();
    }

    /// <summary>
    /// Raised when a manifest file cannot be found or parsed. Callers get a clear,
    /// actionable message (path + underlying reason) instead of a raw
    /// <see cref="JsonException"/> or a null-ref further downstream.
    /// </summary>
    public sealed class AssetManifestException : Exception
    {
        public AssetManifestException(string message, Exception? inner = null)
            : base(message, inner) { }
    }

    /// <summary>
    /// Parsed, in-memory view of <c>game-client/assets/manifest.json</c> — the content
    /// manifest mapping each server type id to its asset (scene + license + source +
    /// tier + kind). Pure data holder: it parses and looks up, it does not load scenes
    /// (that is <c>AssetRegistry</c>'s job, Task 3). Malformed input fails loudly via
    /// <see cref="AssetManifestException"/>; well-formed-but-incomplete entries load
    /// with empty defaults so the drift-gate — not a crash — is what flags them.
    /// </summary>
    public sealed class AssetManifest
    {
        public int Version { get; }

        private readonly Dictionary<string, AssetEntry> _entries;
        private readonly List<AssetEntry> _all;

        private AssetManifest(int version, Dictionary<string, AssetEntry> entries)
        {
            Version = version;
            _entries = entries;
            _all = new List<AssetEntry>(entries.Values);
        }

        /// <summary>Every entry in the manifest, in insertion order.</summary>
        public IReadOnlyList<AssetEntry> All => _all;

        /// <summary>Number of mapped type ids.</summary>
        public int Count => _entries.Count;

        /// <summary>
        /// Look up the asset entry for a server type id. Returns <c>false</c> (and
        /// <paramref name="entry"/> = null) for an unmapped id — never throws.
        /// </summary>
        public bool TryGet(string typeId, out AssetEntry entry)
        {
            if (!string.IsNullOrEmpty(typeId) && _entries.TryGetValue(typeId, out AssetEntry? found))
            {
                entry = found;
                return true;
            }

            entry = null!;
            return false;
        }

        /// <summary>
        /// Load and parse a manifest from a <c>res://…</c> path. Throws
        /// <see cref="AssetManifestException"/> if the file is missing or the JSON is
        /// malformed.
        /// </summary>
        public static AssetManifest Load(string resPath)
        {
            using FileAccess? file = FileAccess.Open(resPath, FileAccess.ModeFlags.Read);
            if (file == null)
            {
                if (resPath == AssetRegistry.DefaultManifestPath)
                {
                    return Parse(EmbeddedDefaultManifestJson);
                }

                Error err = FileAccess.GetOpenError();
                throw new AssetManifestException(
                    $"AssetManifest: cannot open manifest at '{resPath}' (error={err}).");
            }

            string json = file.GetAsText();
            try
            {
                return Parse(json);
            }
            catch (AssetManifestException ex)
            {
                // Re-wrap with the path so the message pinpoints the offending file.
                throw new AssetManifestException(
                    $"AssetManifest: failed to parse '{resPath}': {ex.Message}", ex.InnerException);
            }
        }

        /// <summary>
        /// Parse a manifest from a raw JSON string using reflection-free <see cref="JsonDocument"/>
        /// so it works identically on Desktop JIT and iOS NativeAOT.
        /// </summary>
        public static AssetManifest Parse(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new AssetManifestException("manifest JSON parsed to null (empty or 'null' document).");
            }

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(json, DocOptions);
            }
            catch (JsonException ex)
            {
                throw new AssetManifestException(
                    $"malformed manifest JSON: {ex.Message}", ex);
            }

            using (doc)
            {
                JsonElement root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Null)
                {
                    throw new AssetManifestException("manifest JSON parsed to null (empty or 'null' document).");
                }
                if (root.ValueKind != JsonValueKind.Object)
                {
                    throw new AssetManifestException($"manifest root must be a JSON object (got {root.ValueKind}).");
                }

                int version = 0;
                var entries = new Dictionary<string, AssetEntry>();

                foreach (JsonProperty prop in root.EnumerateObject())
                {
                    if (string.Equals(prop.Name, "version", StringComparison.OrdinalIgnoreCase))
                    {
                        if (prop.Value.ValueKind == JsonValueKind.Number && prop.Value.TryGetInt32(out int v))
                            version = v;
                    }
                    else if (string.Equals(prop.Name, "entries", StringComparison.OrdinalIgnoreCase) &&
                             prop.Value.ValueKind == JsonValueKind.Object)
                    {
                        foreach (JsonProperty entryProp in prop.Value.EnumerateObject())
                        {
                            string key = entryProp.Name;
                            string scene = "";
                            string source = "";
                            string license = "";
                            string tier = "";
                            string kind = "";
                            var anims = new Dictionary<string, string>();

                            if (entryProp.Value.ValueKind == JsonValueKind.Object)
                            {
                                foreach (JsonProperty field in entryProp.Value.EnumerateObject())
                                {
                                    if (string.Equals(field.Name, "scene", StringComparison.OrdinalIgnoreCase) &&
                                        field.Value.ValueKind == JsonValueKind.String)
                                    {
                                        scene = field.Value.GetString() ?? "";
                                    }
                                    else if (string.Equals(field.Name, "source", StringComparison.OrdinalIgnoreCase) &&
                                             field.Value.ValueKind == JsonValueKind.String)
                                    {
                                        source = field.Value.GetString() ?? "";
                                    }
                                    else if (string.Equals(field.Name, "license", StringComparison.OrdinalIgnoreCase) &&
                                             field.Value.ValueKind == JsonValueKind.String)
                                    {
                                        license = field.Value.GetString() ?? "";
                                    }
                                    else if (string.Equals(field.Name, "tier", StringComparison.OrdinalIgnoreCase) &&
                                             field.Value.ValueKind == JsonValueKind.String)
                                    {
                                        tier = field.Value.GetString() ?? "";
                                    }
                                    else if (string.Equals(field.Name, "kind", StringComparison.OrdinalIgnoreCase) &&
                                             field.Value.ValueKind == JsonValueKind.String)
                                    {
                                        kind = field.Value.GetString() ?? "";
                                    }
                                    else if (string.Equals(field.Name, "anims", StringComparison.OrdinalIgnoreCase) &&
                                             field.Value.ValueKind == JsonValueKind.Object)
                                    {
                                        foreach (JsonProperty animProp in field.Value.EnumerateObject())
                                        {
                                            if (animProp.Value.ValueKind == JsonValueKind.String)
                                                anims[animProp.Name] = animProp.Value.GetString() ?? "";
                                        }
                                    }
                                }
                            }

                            entries[key] = new AssetEntry
                            {
                                TypeId = key,
                                Scene = scene,
                                Source = source,
                                License = license,
                                Tier = tier,
                                Kind = kind,
                                Anims = anims,
                            };
                        }
                    }
                }

                return new AssetManifest(version, entries);
            }
        }

        private static readonly JsonDocumentOptions DocOptions = new()
        {
            AllowTrailingCommas = true,
            CommentHandling = JsonCommentHandling.Skip,
        };

        private const string EmbeddedDefaultManifestJson = """
        {
          "version": 2,
          "entries": {
            "player": {
              "scene": "res://assets/characters/player_knight.glb",
              "source": "internal",
              "license": "CC0",
              "tier": "bespoke",
              "kind": "character",
              "anims": {
                "idle": "Idle",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "1H_Melee_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "npc": {
              "scene": "res://assets/characters/cleric.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "character",
              "anims": {
                "idle": "Idle_A",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Melee_1H_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "mob:aggressive": {
              "scene": "res://assets/characters/orc_brute.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "character",
              "anims": {
                "idle": "Idle_A",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Melee_1H_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "mob:balanced": {
              "scene": "res://assets/characters/skeleton_minion.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "character",
              "anims": {
                "idle": "Idle_A",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Melee_1H_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "mob:defensive": {
              "scene": "res://assets/characters/skeleton_golem.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "character",
              "anims": {
                "idle": "Idle_A",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Melee_1H_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "mob:double_attacker": {
              "scene": "res://assets/characters/skeleton_rogue.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "character",
              "anims": {
                "idle": "Idle_A",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Melee_1H_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "mob:hybrid": {
              "scene": "res://assets/characters/skeleton_mage.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "character",
              "anims": {
                "idle": "Idle_A",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Melee_1H_Attack_Slice_Diagonal",
                "death": "Death_A"
              }
            },
            "mob:spear_thrower": {
              "scene": "res://assets/characters/mob_spear_thrower.glb",
              "source": "internal",
              "license": "CC0",
              "tier": "bespoke",
              "kind": "character",
              "anims": {
                "idle": "Idle",
                "walk": "Walking_A",
                "run": "Running_A",
                "attack": "Throw",
                "death": "Death_A"
              }
            },
            "projectile:arrow": {
              "scene": "res://assets/vfx/projectile-arrow.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "projectile:spear": {
              "scene": "res://assets/vfx/projectile-spear.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "projectile:magicSpear": {
              "scene": "res://assets/vfx/projectile-spear.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "projectile:physicSpear": {
              "scene": "res://assets/vfx/projectile-spear.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "projectile:melee": {
              "scene": "res://assets/vfx/projectile-melee.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "projectile:smallMeelee": {
              "scene": "res://assets/vfx/projectile-melee.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "projectile:largeMeelee": {
              "scene": "res://assets/vfx/projectile-melee.glb",
              "source": "market",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "zone:damage": {
              "scene": "res://assets/vfx/zones/zone-damage.glb",
              "source": "authored",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "zone:freeze": {
              "scene": "res://assets/vfx/zones/zone-freeze.glb",
              "source": "authored",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "zone:impulse_caster": {
              "scene": "res://assets/vfx/zones/zone-impulse-caster.glb",
              "source": "authored",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            },
            "zone:stun": {
              "scene": "res://assets/vfx/zones/zone-stun.glb",
              "source": "authored",
              "license": "CC0",
              "tier": "seed",
              "kind": "vfx"
            }
          }
        }
        """;
    }
}
