using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
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
        /// Parse a manifest from a raw JSON string. Exposed (over just <see cref="Load"/>)
        /// so the parse path is verifiable without touching the filesystem. Throws
        /// <see cref="AssetManifestException"/> on malformed JSON.
        /// </summary>
        public static AssetManifest Parse(string json)
        {
            ManifestDto? dto;
            try
            {
                dto = JsonSerializer.Deserialize<ManifestDto>(json, JsonOptions);
            }
            catch (JsonException ex)
            {
                throw new AssetManifestException(
                    $"malformed manifest JSON: {ex.Message}", ex);
            }

            if (dto == null)
            {
                throw new AssetManifestException("manifest JSON parsed to null (empty or 'null' document).");
            }

            var entries = new Dictionary<string, AssetEntry>();
            if (dto.Entries != null)
            {
                foreach (KeyValuePair<string, EntryDto?> kv in dto.Entries)
                {
                    EntryDto d = kv.Value ?? new EntryDto();
                    entries[kv.Key] = new AssetEntry
                    {
                        TypeId = kv.Key,
                        Scene = d.Scene ?? "",
                        Source = d.Source ?? "",
                        License = d.License ?? "",
                        Tier = d.Tier ?? "",
                        Kind = d.Kind ?? "",
                        Anims = d.Anims ?? new Dictionary<string, string>(),
                    };
                }
            }

            return new AssetManifest(dto.Version, entries);
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
            AllowTrailingCommas = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
        };

        // --- DTOs (System.Text.Json binding shapes) -------------------------------

        private sealed class ManifestDto
        {
            [JsonPropertyName("version")]
            public int Version { get; set; }

            [JsonPropertyName("entries")]
            public Dictionary<string, EntryDto?>? Entries { get; set; }
        }

        private sealed class EntryDto
        {
            [JsonPropertyName("scene")]
            public string? Scene { get; set; }

            [JsonPropertyName("source")]
            public string? Source { get; set; }

            [JsonPropertyName("license")]
            public string? License { get; set; }

            [JsonPropertyName("tier")]
            public string? Tier { get; set; }

            [JsonPropertyName("kind")]
            public string? Kind { get; set; }

            [JsonPropertyName("anims")]
            public Dictionary<string, string>? Anims { get; set; }
        }
    }
}
