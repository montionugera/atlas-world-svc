# I-246 handoff

**Goal (verbatim):** `atlas-world.joymify.local.com` always shows exactly what the last release shipped, from a cluster workload, so an image or game-data change lands through the normal release flow and never depends on which checkout holds a port.

**Owner's words:** "for image change and Atlas Game DB we can having small app in local k8s and deploy via release".

**Plan:** `.claude/idea_backlog/I-246-atlas-web-app-in-local-k8s-deployed-via/plan.md`. Spec is beside it.

**State:** plan written, not yet audited. `self-grill-audit` needs an Agent dispatch, which the swap hook denies at 85%.

**Next:** finish F-167 first (it edits the same frontend files). Then audit this plan, fold in CRITICAL/HIGH fixes, `psrw refine I-246`, claim, `subagent-driven-development`.

**After build:** `psrw ship --deploy`, then `psrw promote --direct`.
