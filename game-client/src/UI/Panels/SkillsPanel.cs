using System.Collections.Generic;
using System.Linq;
using Godot;
using AtlasWorld.Contracts.Meta;
using AtlasWorld.Client.Meta;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Skills screen: lists UNLOCKED skills and lets the player toggle up to
    /// <see cref="MetaIds.MaxSkillLoadout"/> into the active loadout, driving
    /// <c>set_skill_loadout</c> with {loadout: string[]}. The cap is enforced client-side
    /// before the call (the server rejects over-cap / not-unlocked too).
    /// </summary>
    public sealed partial class SkillsPanel : MetaPanel
    {
        private Label _capLabel = null!;
        private VBoxContainer _list = null!;

        private SkillsDoc _skills = new() { unlocked = new(), loadout = new() };
        private readonly List<string> _loadout = new();

        protected override void OnPanelReady()
        {
            AddTitle("Skills");
            _capLabel = new Label { ThemeTypeVariation = Design.Variants.Caption };
            Content.AddChild(_capLabel);
            _list = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            _list.AddThemeConstantOverride("separation", Design.Space.S3);
            Content.AddChild(_list);
        }

        public override void Refresh() => Gateway?.RequestDoc(MetaIds.Collections.Skills);

        protected override void OnDocLoaded(string collection, string json, bool ok)
        {
            if (collection != MetaIds.Collections.Skills) return;
            _skills = MetaJson.ParseSkillsOrDefault(json);
            _loadout.Clear();
            _loadout.AddRange(_skills.loadout);
            Render();
        }

        protected override void OnRpcResult(string rpcId, string payload, bool ok, string error)
        {
            if (rpcId != MetaIds.Rpc.SetSkillLoadout) return;
            if (ok)
            {
                SkillsDoc? updated = MetaJson.Parse<SkillsDoc>(payload);
                if (updated != null)
                {
                    updated.unlocked ??= new();
                    updated.loadout ??= new();
                    _skills = updated;
                    _loadout.Clear();
                    _loadout.AddRange(updated.loadout);
                }
                Render();
            }
            else
            {
                _loadout.Clear();
                _loadout.AddRange(_skills.loadout); // rollback
                Render();
                Toast.Show(this, $"Loadout failed: {error}", Toast.Kind.Danger);
            }
        }

        private void OnToggle(string skillId, bool equip)
        {
            if (equip)
            {
                if (_loadout.Count >= MetaIds.MaxSkillLoadout)
                {
                    Render(); // reflect the rejected toggle back to "Equip"
                    Toast.Show(this, $"Loadout is full (max {MetaIds.MaxSkillLoadout})", Toast.Kind.Info);
                    return;
                }
                if (!_loadout.Contains(skillId)) _loadout.Add(skillId);
            }
            else
            {
                _loadout.Remove(skillId);
            }
            string arr = string.Join(",", _loadout.Select(id => $"\"{id}\""));
            Gateway?.Rpc(MetaIds.Rpc.SetSkillLoadout, $"{{\"loadout\":[{arr}]}}");
        }

        private void Render()
        {
            _capLabel.Text = $"Equipped {_loadout.Count} / {MetaIds.MaxSkillLoadout}";
            foreach (Node child in _list.GetChildren()) child.QueueFree();

            if (_skills.unlocked.Count == 0)
            {
                _list.AddChild(new Label
                {
                    Text = "(no skills unlocked yet)",
                    ThemeTypeVariation = Design.Variants.Caption,
                });
                return;
            }

            foreach (SkillsDoc_UnlockedItem u in _skills.unlocked)
            {
                var tile = new SkillTile(u.skillId, (int)u.level, _loadout.Contains(u.skillId));
                tile.ToggledSkill += OnToggle;
                _list.AddChild(tile);
            }
        }
    }
}
