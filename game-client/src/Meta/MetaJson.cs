using System.Text.Json;
using AtlasWorld.Contracts.Meta;

namespace AtlasWorld.Client.Meta
{
    /// <summary>
    /// Parses Nakama storage-doc JSON into the generated <c>AtlasWorld.Contracts.Meta</c>
    /// POCOs. Those POCOs expose public <b>fields</b> (not properties), so
    /// <c>IncludeFields</c> is mandatory. The <c>@int</c> field deserialises from the
    /// JSON key <c>"int"</c> automatically (the member name is <c>int</c>).
    /// </summary>
    public static class MetaJson
    {
        private static readonly JsonSerializerOptions Options = new()
        {
            IncludeFields = true,
            PropertyNameCaseInsensitive = true,
        };

        public static T? Parse<T>(string json) where T : class
        {
            if (string.IsNullOrEmpty(json)) return null;
            try { return JsonSerializer.Deserialize<T>(json, Options); }
            catch { return null; }
        }

        public static ProfileDoc ParseProfileOrDefault(string json) =>
            Parse<ProfileDoc>(json) ?? DefaultProfile();

        public static ProfileDoc DefaultProfile() => new()
        {
            schemaVersion = 1,
            level = 1,
            xp = 0,
            statPoints = 0,
            allocated = new PrimaryStats { str = 1, agi = 1, @int = 1, vit = 1 },
        };

        public static InventoryDoc ParseInventoryOrDefault(string json)
        {
            InventoryDoc doc = Parse<InventoryDoc>(json) ?? new InventoryDoc();
            doc.stackables ??= new();
            doc.uniques ??= new();
            return doc;
        }

        public static EquipmentDoc ParseEquipmentOrDefault(string json)
        {
            EquipmentDoc doc = Parse<EquipmentDoc>(json) ?? new EquipmentDoc();
            doc.slots ??= new EquipmentDoc_Slots();
            return doc;
        }

        public static SkillsDoc ParseSkillsOrDefault(string json)
        {
            SkillsDoc doc = Parse<SkillsDoc>(json) ?? new SkillsDoc();
            doc.unlocked ??= new();
            doc.loadout ??= new();
            return doc;
        }

        public static QuestsDoc ParseQuestsOrDefault(string json)
        {
            QuestsDoc doc = Parse<QuestsDoc>(json) ?? new QuestsDoc();
            doc.active ??= new();
            doc.completed ??= new();
            return doc;
        }
    }
}
