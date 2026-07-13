using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;
using Godot;

namespace AtlasWorld.Client.Audio
{
    /// <summary>
    /// One resolved SFX mapping: the combat event key this entry answers for (e.g.
    /// <c>sfx:attack</c>) plus where its sound lives and its license. Mirrors
    /// <c>Content.AssetEntry</c>'s shape/defaults-never-null philosophy so downstream
    /// code never needs a null-guard.
    /// </summary>
    public sealed class AudioEntry
    {
        /// <summary>The event key this entry maps (e.g. <c>sfx:attack</c>).</summary>
        public string EventKey { get; init; } = "";

        /// <summary><c>res://…</c> path to the <see cref="AudioStream"/> to play for this event.</summary>
        public string Stream { get; init; } = "";

        /// <summary>License string recorded at intake (e.g. <c>CC0 (Kenney RPG Audio)</c>).</summary>
        public string License { get; init; } = "";
    }

    /// <summary>
    /// Raised when the audio manifest file cannot be found or parsed.
    /// </summary>
    public sealed class AudioManifestException : Exception
    {
        public AudioManifestException(string message, Exception? inner = null)
            : base(message, inner) { }
    }

    /// <summary>
    /// Parsed, in-memory view of <c>game-client/assets/audio-manifest.json</c> — a
    /// SEPARATE manifest from the render asset manifest (<c>Content.AssetManifest</c>),
    /// mapping each combat SFX event key to its stream + license. Pure data holder: it
    /// parses and looks up, it does not load the <see cref="AudioStream"/> resource
    /// (that is <see cref="AudioRegistry"/>'s job). Malformed input fails loudly via
    /// <see cref="AudioManifestException"/>; a missing/blank field loads with empty
    /// defaults so the registry — not a crash — is what flags it.
    /// </summary>
    public sealed class AudioManifest
    {
        public int Version { get; }

        private readonly Dictionary<string, AudioEntry> _entries;

        private AudioManifest(int version, Dictionary<string, AudioEntry> entries)
        {
            Version = version;
            _entries = entries;
        }

        /// <summary>Number of mapped event keys.</summary>
        public int Count => _entries.Count;

        /// <summary>
        /// Look up the audio entry for an event key. Returns <c>false</c> (and
        /// <paramref name="entry"/> = null) for an unmapped key — never throws.
        /// </summary>
        public bool TryGet(string eventKey, out AudioEntry entry)
        {
            if (!string.IsNullOrEmpty(eventKey) && _entries.TryGetValue(eventKey, out AudioEntry? found))
            {
                entry = found;
                return true;
            }

            entry = null!;
            return false;
        }

        /// <summary>
        /// Load and parse a manifest from a <c>res://…</c> path. Throws
        /// <see cref="AudioManifestException"/> if the file is missing or the JSON is
        /// malformed.
        /// </summary>
        public static AudioManifest Load(string resPath)
        {
            using FileAccess? file = FileAccess.Open(resPath, FileAccess.ModeFlags.Read);
            if (file == null)
            {
                Error err = FileAccess.GetOpenError();
                throw new AudioManifestException(
                    $"AudioManifest: cannot open manifest at '{resPath}' (error={err}).");
            }

            string json = file.GetAsText();
            try
            {
                return Parse(json);
            }
            catch (AudioManifestException ex)
            {
                throw new AudioManifestException(
                    $"AudioManifest: failed to parse '{resPath}': {ex.Message}", ex.InnerException);
            }
        }

        /// <summary>
        /// Parse a manifest from a raw JSON string. Exposed (over just <see cref="Load"/>)
        /// so the parse path is verifiable without touching the filesystem.
        /// </summary>
        public static AudioManifest Parse(string json)
        {
            ManifestDto? dto;
            try
            {
                dto = JsonSerializer.Deserialize<ManifestDto>(json, JsonOptions);
            }
            catch (JsonException ex)
            {
                throw new AudioManifestException($"malformed audio manifest JSON: {ex.Message}", ex);
            }

            if (dto == null)
                throw new AudioManifestException("audio manifest JSON parsed to null (empty or 'null' document).");

            var entries = new Dictionary<string, AudioEntry>();
            if (dto.Entries != null)
            {
                foreach (KeyValuePair<string, EntryDto?> kv in dto.Entries)
                {
                    EntryDto d = kv.Value ?? new EntryDto();
                    entries[kv.Key] = new AudioEntry
                    {
                        EventKey = kv.Key,
                        Stream = d.Stream ?? "",
                        License = d.License ?? "",
                    };
                }
            }

            return new AudioManifest(dto.Version, entries);
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true,
            AllowTrailingCommas = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
        };

        private sealed class ManifestDto
        {
            [JsonPropertyName("version")]
            public int Version { get; set; }

            [JsonPropertyName("entries")]
            public Dictionary<string, EntryDto?>? Entries { get; set; }
        }

        private sealed class EntryDto
        {
            [JsonPropertyName("stream")]
            public string? Stream { get; set; }

            [JsonPropertyName("license")]
            public string? License { get; set; }
        }
    }
}
