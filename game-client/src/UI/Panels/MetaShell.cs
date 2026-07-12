using System.Collections.Generic;
using Godot;
using AtlasWorld.Client.Meta;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// The meta overlay. A CanvasLayer (layer 10) with a Scrim + a framed window that holds
    /// the F-001 screens. Navigation is a LEFT NAV RAIL on wide viewports and a BOTTOM TAB
    /// BAR below <see cref="Design.NavBreakpointPx"/> (900px). Toggled with Tab, closed with
    /// Esc. While open it sets <see cref="MetaGateway.CapturesInput"/> so the input layer can
    /// suppress movement — with zero coupling from Net/World back to the UI.
    ///
    /// The whole shell applies the token-built theme (<see cref="ThemeBuilder.Build"/>), so
    /// every child inherits the design system.
    /// </summary>
    public sealed partial class MetaShell : CanvasLayer
    {
        private readonly record struct Tab(string Title, MetaPanel Panel);

        private Control _root = null!;
        private ColorRect _scrim = null!;
        private PanelContainer _frame = null!;
        private BoxContainer _body = null!;      // HBox (rail) or VBox (bottom tabs)
        private BoxContainer _nav = null!;       // VBox (rail) or HBox (bottom tabs)
        private PanelContainer _contentHost = null!;

        private readonly List<Tab> _tabs = new();
        private readonly List<Button> _navButtons = new();
        private int _active = -1;
        private bool _wideLayout = true;

        public override void _Ready()
        {
            Layer = 10;
            Name = "MetaShell";

            _root = new Control { MouseFilter = Control.MouseFilterEnum.Stop };
            _root.SetAnchorsPreset(Control.LayoutPreset.FullRect);
            _root.Theme = ThemeBuilder.Build();
            AddChild(_root);

            _scrim = new ColorRect { Color = Design.Colors.Scrim, MouseFilter = Control.MouseFilterEnum.Stop };
            _scrim.SetAnchorsPreset(Control.LayoutPreset.FullRect);
            _root.AddChild(_scrim);

            _frame = new PanelContainer();
            _frame.SetAnchorsPreset(Control.LayoutPreset.FullRect);
            _frame.OffsetLeft = Design.Space.S6;
            _frame.OffsetTop = Design.Space.S6;
            _frame.OffsetRight = -Design.Space.S6;
            _frame.OffsetBottom = -Design.Space.S6;
            _root.AddChild(_frame);

            var pad = new MarginContainer();
            foreach (string side in new[] { "margin_left", "margin_top", "margin_right", "margin_bottom" })
                pad.AddThemeConstantOverride(side, Design.Space.S5);
            _frame.AddChild(pad);

            _body = new HBoxContainer();
            _body.AddThemeConstantOverride("separation", Design.Space.S5);
            pad.AddChild(_body);

            _nav = new VBoxContainer { CustomMinimumSize = new Vector2(180, 0) };
            _nav.AddThemeConstantOverride("separation", Design.Space.S2);

            _contentHost = new PanelContainer();
            _contentHost.SizeFlagsHorizontal = Control.SizeFlags.ExpandFill;
            _contentHost.SizeFlagsVertical = Control.SizeFlags.ExpandFill;

            BuildTabs();
            ApplyResponsive();

            GetViewport().SizeChanged += ApplyResponsive;
            Visible = false;
            SetActive(0);
        }

        private void BuildTabs()
        {
            AddTab("Character", new CharacterPanel());
            AddTab("Inventory", new InventoryPanel());
            AddTab("Skills", new SkillsPanel());
            AddTab("Quests", new QuestPanel());
            AddTab("Loadout", new LoadoutPanel());

            for (int i = 0; i < _tabs.Count; i++)
            {
                int index = i;
                var btn = new Button
                {
                    Text = _tabs[i].Title,
                    ThemeTypeVariation = Design.Variants.GhostButton,
                    SizeFlagsHorizontal = Control.SizeFlags.ExpandFill,
                    CustomMinimumSize = new Vector2(0, 40),
                };
                btn.Pressed += () => SetActive(index);
                _navButtons.Add(btn);
                _nav.AddChild(btn);
            }
        }

        private void AddTab(string title, MetaPanel panel)
        {
            panel.Visible = false;
            _contentHost.AddChild(panel);
            _tabs.Add(new Tab(title, panel));
        }

        private void SetActive(int index)
        {
            if (index < 0 || index >= _tabs.Count) return;
            _active = index;
            for (int i = 0; i < _tabs.Count; i++)
            {
                bool on = i == index;
                _tabs[i].Panel.Visible = on;
                _navButtons[i].ThemeTypeVariation = on
                    ? Design.Variants.PrimaryButton
                    : Design.Variants.GhostButton;
            }
            if (Visible) _tabs[index].Panel.Refresh();
        }

        /// <summary>Swap between nav rail (wide) and bottom tab bar (narrow) at the breakpoint.</summary>
        private void ApplyResponsive()
        {
            bool wide = GetViewport().GetVisibleRect().Size.X >= Design.NavBreakpointPx;
            if (wide == _wideLayout && _nav.GetParent() != null) { UpdateColumns(); return; }
            _wideLayout = wide;

            // Detach existing children, rebuild _body in the right orientation.
            if (_nav.GetParent() != null) _nav.GetParent().RemoveChild(_nav);
            if (_contentHost.GetParent() != null) _contentHost.GetParent().RemoveChild(_contentHost);
            foreach (Node c in _body.GetChildren()) _body.RemoveChild(c);
            BoxContainer oldBody = _body;
            oldBody.GetParent()?.RemoveChild(oldBody);
            oldBody.QueueFree();

            _body = wide ? new HBoxContainer() : new VBoxContainer();
            _body.AddThemeConstantOverride("separation", Design.Space.S5);
            _body.SizeFlagsHorizontal = Control.SizeFlags.ExpandFill;
            _body.SizeFlagsVertical = Control.SizeFlags.ExpandFill;
            _frame.GetChild(0).AddChild(_body); // pad is _frame's only child

            // Nav orientation: vertical rail on wide, horizontal bar on narrow.
            RebuildNavOrientation(wide);

            if (wide)
            {
                _body.AddChild(_nav);
                _body.AddChild(_contentHost);
            }
            else
            {
                _body.AddChild(_contentHost);
                _body.AddChild(_nav);
            }
            UpdateColumns();
        }

        private void RebuildNavOrientation(bool wide)
        {
            foreach (Node b in _nav.GetChildren()) _nav.RemoveChild(b);
            BoxContainer newNav = wide ? new VBoxContainer() : new HBoxContainer();
            newNav.AddThemeConstantOverride("separation", Design.Space.S2);
            if (wide) newNav.CustomMinimumSize = new Vector2(180, 0);
            newNav.SizeFlagsHorizontal = Control.SizeFlags.ExpandFill;
            foreach (Button b in _navButtons) newNav.AddChild(b);
            _nav = newNav;
        }

        private void UpdateColumns()
        {
            int columns = _wideLayout ? 3 : 2;
            foreach (Tab t in _tabs)
                if (t.Panel is InventoryPanel inv) inv.SetColumns(columns);
        }

        // ---- Open/close + input --------------------------------------------------------
        public void Toggle() => SetOpen(!Visible);

        public void SetOpen(bool open)
        {
            Visible = open;
            MetaGateway.CapturesInput = open;
            if (open && _active >= 0) _tabs[_active].Panel.Refresh();
        }

        public override void _Input(InputEvent @event)
        {
            if (@event is not InputEventKey { Pressed: true, Echo: false } key) return;
            switch (key.Keycode)
            {
                case Key.Tab:
                    Toggle();
                    GetViewport().SetInputAsHandled();
                    break;
                case Key.Escape when Visible:
                    SetOpen(false);
                    GetViewport().SetInputAsHandled();
                    break;
            }
        }

        public override void _ExitTree()
        {
            if (GetViewport() != null) GetViewport().SizeChanged -= ApplyResponsive;
        }
    }
}
