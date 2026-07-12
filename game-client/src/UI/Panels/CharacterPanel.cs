using Godot;
using AtlasWorld.Contracts.Meta;
using AtlasWorld.Client.Meta;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Character screen: level, an XP bar (xpToNext = 100*level), and the four allocatable
    /// primary stats. "+" does an OPTIMISTIC allocate: it bumps the display immediately,
    /// fires <c>allocate_stats</c> with a {str,agi,int,vit} DELTA, then reconciles with the
    /// authoritative profile the RPC returns — or rolls back + toasts on failure.
    /// </summary>
    public sealed partial class CharacterPanel : MetaPanel
    {
        private static readonly (string key, string label)[] Stats =
        {
            ("str", "Strength"),
            ("agi", "Agility"),
            ("int", "Intelligence"),
            ("vit", "Vitality"),
        };

        private Label _level = null!;
        private ProgressBar _xpBar = null!;
        private Label _xpText = null!;
        private Label _statPoints = null!;
        private readonly System.Collections.Generic.Dictionary<string, StatRow> _rows = new();

        private ProfileDoc _server = MetaJson.DefaultProfile(); // last authoritative
        private ProfileDoc _display = MetaJson.DefaultProfile(); // possibly optimistic
        private bool _pending;

        protected override void OnPanelReady()
        {
            AddTitle("Character");

            _level = new Label { Text = "Level 1", ThemeTypeVariation = Design.Variants.Subheading };
            Content.AddChild(_level);

            _xpBar = new ProgressBar { MinValue = 0, MaxValue = 100, Value = 0, ShowPercentage = false };
            _xpBar.CustomMinimumSize = new Vector2(0, 14);
            Content.AddChild(_xpBar);

            _xpText = new Label { Text = "0 / 100 XP", ThemeTypeVariation = Design.Variants.Caption };
            Content.AddChild(_xpText);

            Content.AddChild(new HSeparator());

            _statPoints = new Label { Text = "Stat points: 0", ThemeTypeVariation = Design.Variants.Body };
            Content.AddChild(_statPoints);

            foreach ((string key, string label) in Stats)
            {
                var row = new StatRow(key, label);
                row.AddPressed += OnAllocate;
                _rows[key] = row;
                Content.AddChild(row);
            }
        }

        public override void Refresh() => Gateway?.RequestDoc(MetaIds.Collections.Profile);

        protected override void OnDocLoaded(string collection, string json, bool ok)
        {
            if (collection != MetaIds.Collections.Profile) return;
            _server = MetaJson.ParseProfileOrDefault(json);
            _display = MetaJson.ParseProfileOrDefault(json);
            _pending = false;
            Render();
        }

        private void OnAllocate(string statKey)
        {
            if (_pending || _display.statPoints <= 0) return;

            _pending = true;
            _display = Clone(_display);
            _display.statPoints -= 1;
            Bump(_display.allocated, statKey, +1);
            Render(); // optimistic

            Gateway?.Rpc(MetaIds.Rpc.AllocateStats, DeltaJson(statKey));
        }

        protected override void OnRpcResult(string rpcId, string payload, bool ok, string error)
        {
            if (rpcId != MetaIds.Rpc.AllocateStats) return;
            _pending = false;

            if (ok)
            {
                ProfileDoc? updated = MetaJson.Parse<ProfileDoc>(payload);
                if (updated != null)
                {
                    updated.allocated ??= _server.allocated;
                    _server = updated;
                    _display = Clone(updated);
                }
            }
            else
            {
                _display = Clone(_server); // rollback
                Toast.Show(this, $"Allocate failed: {error}", Toast.Kind.Danger);
            }
            Render();
        }

        private void Render()
        {
            int level = (int)_display.level;
            int xp = (int)_display.xp;
            int needed = MetaIds.XpToNext(level);
            int points = (int)_display.statPoints;

            _level.Text = $"Level {level}";
            _xpBar.MaxValue = needed <= 0 ? 1 : needed;
            _xpBar.Value = Mathf.Clamp(xp, 0, needed);
            _xpText.Text = $"{xp} / {needed} XP";
            _statPoints.Text = $"Stat points: {points}";

            bool canAdd = points > 0 && !_pending;
            PrimaryStats a = _display.allocated ?? new PrimaryStats();
            _rows["str"].UpdateValue((int)a.str, canAdd);
            _rows["agi"].UpdateValue((int)a.agi, canAdd);
            _rows["int"].UpdateValue((int)a.@int, canAdd);
            _rows["vit"].UpdateValue((int)a.vit, canAdd);
        }

        // ---- helpers -------------------------------------------------------------------
        private static string DeltaJson(string statKey) => statKey switch
        {
            "str" => "{\"str\":1,\"agi\":0,\"int\":0,\"vit\":0}",
            "agi" => "{\"str\":0,\"agi\":1,\"int\":0,\"vit\":0}",
            "int" => "{\"str\":0,\"agi\":0,\"int\":1,\"vit\":0}",
            "vit" => "{\"str\":0,\"agi\":0,\"int\":0,\"vit\":1}",
            _ => "{\"str\":0,\"agi\":0,\"int\":0,\"vit\":0}",
        };

        private static void Bump(PrimaryStats s, string key, int by)
        {
            switch (key)
            {
                case "str": s.str += by; break;
                case "agi": s.agi += by; break;
                case "int": s.@int += by; break;
                case "vit": s.vit += by; break;
            }
        }

        private static ProfileDoc Clone(ProfileDoc p) => new()
        {
            schemaVersion = p.schemaVersion,
            level = p.level,
            xp = p.xp,
            statPoints = p.statPoints,
            allocated = new PrimaryStats
            {
                str = p.allocated?.str ?? 0,
                agi = p.allocated?.agi ?? 0,
                @int = p.allocated?.@int ?? 0,
                vit = p.allocated?.vit ?? 0,
            },
        };
    }
}
