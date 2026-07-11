using Godot;
using AtlasWorld.Client.Meta;

namespace AtlasWorld.Client.UI.Panels
{
    /// <summary>
    /// Base for the meta screens: a scrollable column, a title, and a convenient handle to
    /// the <see cref="MetaGateway"/> autoload. Panels are PURE SIGNAL LISTENERS — they call
    /// gateway kickers (RequestDoc / Rpc) and react on DocLoaded / RpcResult; they never
    /// await Nakama themselves.
    /// </summary>
    public abstract partial class MetaPanel : ScrollContainer
    {
        protected VBoxContainer Content = null!;

        protected static MetaGateway? Gateway => MetaGateway.Instance;

        public override void _Ready()
        {
            SizeFlagsHorizontal = SizeFlags.ExpandFill;
            SizeFlagsVertical = SizeFlags.ExpandFill;
            HorizontalScrollMode = ScrollMode.Disabled;

            Content = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
            Content.AddThemeConstantOverride("separation", Design.Space.S4);
            AddChild(Content);

            OnPanelReady();

            if (Gateway != null)
            {
                Gateway.DocLoaded += OnDocLoaded;
                Gateway.RpcResult += OnRpcResult;
            }
        }

        public override void _ExitTree()
        {
            if (Gateway != null)
            {
                Gateway.DocLoaded -= OnDocLoaded;
                Gateway.RpcResult -= OnRpcResult;
            }
        }

        protected Label AddTitle(string text)
        {
            var title = new Label { Text = text, ThemeTypeVariation = Design.Variants.Heading };
            Content.AddChild(title);
            return title;
        }

        /// <summary>Build static children. Called once in _Ready.</summary>
        protected abstract void OnPanelReady();

        /// <summary>Called when the panel becomes visible in the shell — (re)load its docs.</summary>
        public abstract void Refresh();

        protected virtual void OnDocLoaded(string collection, string json, bool ok) { }
        protected virtual void OnRpcResult(string rpcId, string payload, bool ok, string error) { }
    }
}
