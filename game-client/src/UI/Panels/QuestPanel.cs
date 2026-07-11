using System.Collections.Generic;
using System.Linq;
using Godot;
using AtlasWorld.Contracts.Meta;
using AtlasWorld.Client.Meta;
using AtlasWorld.Client.UI.Widgets;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Quest log: catalog quests you can <c>accept_quest</c>, your active quests with
    /// objective progress, and completed-but-unclaimed quests with a Claim button that
    /// fires <c>claim_quest_reward</c>. (Objective completion happens server-side via
    /// report_match_events, so the Claim path is wired but only lights up post-match.)
    /// </summary>
    public sealed partial class QuestPanel : MetaPanel
    {
        private VBoxContainer _available = null!;
        private VBoxContainer _active = null!;
        private VBoxContainer _claimable = null!;

        private QuestsDoc _quests = new() { active = new(), completed = new() };

        protected override void OnPanelReady()
        {
            AddTitle("Quests");
            Content.AddChild(new Label { Text = "Available", ThemeTypeVariation = Design.Variants.Subheading });
            _available = Section();
            Content.AddChild(new Label { Text = "Active", ThemeTypeVariation = Design.Variants.Subheading });
            _active = Section();
            Content.AddChild(new Label { Text = "Claimable", ThemeTypeVariation = Design.Variants.Subheading });
            _claimable = Section();
        }

        public override void Refresh() => Gateway?.RequestDoc(MetaIds.Collections.Quests);

        protected override void OnDocLoaded(string collection, string json, bool ok)
        {
            if (collection != MetaIds.Collections.Quests) return;
            _quests = MetaJson.ParseQuestsOrDefault(json);
            Render();
        }

        protected override void OnRpcResult(string rpcId, string payload, bool ok, string error)
        {
            if (rpcId == MetaIds.Rpc.AcceptQuest)
            {
                if (ok)
                {
                    QuestsDoc? updated = MetaJson.Parse<QuestsDoc>(payload);
                    if (updated != null) { updated.active ??= new(); updated.completed ??= new(); _quests = updated; }
                    Render();
                    Toast.Show(this, "Quest accepted", Toast.Kind.Success);
                }
                else Toast.Show(this, $"Accept failed: {error}", Toast.Kind.Danger);
            }
            else if (rpcId == MetaIds.Rpc.ClaimQuestReward)
            {
                if (ok) { Toast.Show(this, "Reward claimed", Toast.Kind.Success); Refresh(); }
                else Toast.Show(this, $"Claim failed: {error}", Toast.Kind.Danger);
            }
        }

        private void Render()
        {
            Clear(_available); Clear(_active); Clear(_claimable);

            var activeIds = _quests.active.Select(q => q.questId).ToHashSet();
            var completedIds = _quests.completed.Select(q => q.questId).ToHashSet();

            // Available = catalog quests neither active nor completed.
            foreach (string questId in Catalog.QuestDisplay.Keys)
            {
                if (activeIds.Contains(questId) || completedIds.Contains(questId)) continue;
                var row = new HBoxContainer();
                row.AddThemeConstantOverride("separation", Design.Space.S3);
                var card = new PanelContainer { ThemeTypeVariation = Design.Variants.Card, SizeFlagsHorizontal = SizeFlags.ExpandFill };
                var inner = new HBoxContainer();
                card.AddChild(inner);
                inner.AddChild(new Label { Text = Catalog.QuestName(questId), ThemeTypeVariation = Design.Variants.Body, SizeFlagsHorizontal = SizeFlags.ExpandFill });
                var accept = new Button { Text = "Accept", ThemeTypeVariation = Design.Variants.GhostButton, CustomMinimumSize = new Vector2(96, 36) };
                string qid = questId;
                accept.Pressed += () => Gateway?.Rpc(MetaIds.Rpc.AcceptQuest, $"{{\"questId\":\"{qid}\"}}");
                inner.AddChild(accept);
                _available.AddChild(card);
            }

            foreach (QuestsDoc_ActiveItem q in _quests.active)
            {
                int progress = q.objectives?.Values.Sum(v => (int)v) ?? 0;
                _active.AddChild(new QuestCard(q.questId, $"in progress · {progress} done", claimable: false));
            }
            if (_quests.active.Count == 0)
                _active.AddChild(new Label { Text = "(none active)", ThemeTypeVariation = Design.Variants.Caption });

            foreach (QuestsDoc_CompletedItem q in _quests.completed.Where(q => !q.claimed))
            {
                var card = new QuestCard(q.questId, "completed — claim your reward", claimable: true);
                card.ClaimPressed += qid => Gateway?.Rpc(MetaIds.Rpc.ClaimQuestReward, $"{{\"questId\":\"{qid}\"}}");
                _claimable.AddChild(card);
            }
            if (_quests.completed.All(q => q.claimed))
                _claimable.AddChild(new Label { Text = "(nothing to claim)", ThemeTypeVariation = Design.Variants.Caption });
        }

        private VBoxContainer Section()
        {
            var v = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            v.AddThemeConstantOverride("separation", Design.Space.S2);
            Content.AddChild(v);
            return v;
        }

        private static void Clear(VBoxContainer v)
        {
            foreach (Node child in v.GetChildren()) child.QueueFree();
        }
    }
}
