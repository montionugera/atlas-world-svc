const STEP = /^stage: (P\d+[a-z]*) (\S+) (\d+) ms$/;
const BUDGET = /^stage: (generate|sheets) (?:(TOTAL) )?(\d+) ms \(budget (\d+), fail (\d+)\)$/;

export function parseStageLine(line) {
  let m = STEP.exec(line);
  if (m) return { kind: "step", name: m[1], label: m[2], ms: Number(m[3]) };
  m = BUDGET.exec(line);
  if (m) return { kind: "budget", stage: m[1], ms: Number(m[3]), budgetMs: Number(m[4]), failMs: Number(m[5]), total: m[2] === "TOTAL" };
  return { kind: "noise", line };
}

export function createStageTracker({ stageCount }) {
  const order = []; const byName = new Map(); let budget = null;
  return {
    push(line) {
      const p = parseStageLine(line);
      if (p.kind === "budget") { budget = { ...(budget ?? {}), [p.stage]: p }; return { type: "job.budget", budget: p }; }
      if (p.kind !== "step") return null;
      let s = byName.get(p.name);
      if (!s) { s = { name: p.name, label: p.label, ms: 0, runs: 0, status: "done" }; byName.set(p.name, s); order.push(p.name); }
      s.ms += p.ms; s.runs += 1;
      return { type: "job.step", step: { ...s }, stepIndex: order.length, stepCount: stageCount };
    },
    steps() { return order.map((n) => ({ ...byName.get(n) })); },
    current() { return order.length ? { ...byName.get(order[order.length - 1]) } : null; },
    stepIndex() { return order.length; },
    budget() { return budget; },
  };
}
