import type { MatchEvent, QuestsDoc, QuestDef } from '@atlas/contracts';

export type { QuestDef };

export interface ApplyEventsResult {
  doc: QuestsDoc;
  /** questIds whose objective progress changed but did not complete. */
  progressed: string[];
  /** questIds that moved from active -> completed on this call. */
  completedNow: string[];
}

/**
 * PURE (no nk, no Date.now() side-dependency beyond stamping completedAt):
 * folds a batch of match events into a player's active quests. Events that
 * don't match any active quest's objective (wrong type/targetId, or the
 * quest isn't active at all) are silently ignored. A quest whose objectives
 * are all >= required moves from `active` to `completed` on this call.
 */
export function applyEvents(doc: QuestsDoc, defs: QuestDef[], events: MatchEvent[]): ApplyEventsResult {
  const defsById = new Map(defs.map((d) => [d.id, d]));
  const progressed: string[] = [];
  const completedNow: string[] = [];
  const now = Date.now();

  const nextActive: QuestsDoc['active'] = [];
  const newlyCompleted: QuestsDoc['completed'] = [];

  for (const activeQuest of doc.active) {
    const def = defsById.get(activeQuest.questId);
    if (!def) {
      // Unknown/retired quest def — leave the entry untouched rather than drop player progress.
      nextActive.push(activeQuest);
      continue;
    }

    const objectives = { ...activeQuest.objectives };
    let changed = false;
    for (const event of events) {
      for (const obj of def.objectives) {
        if (obj.type !== event.type || obj.targetId !== event.targetId) {
          continue;
        }
        const current = objectives[obj.id] ?? 0;
        if (current >= obj.required) {
          continue;
        }
        objectives[obj.id] = Math.min(obj.required, current + event.count);
        changed = true;
      }
    }

    const allComplete = def.objectives.every((obj) => (objectives[obj.id] ?? 0) >= obj.required);
    if (allComplete) {
      newlyCompleted.push({ questId: activeQuest.questId, completedAt: now, claimed: false });
      completedNow.push(activeQuest.questId);
    } else {
      nextActive.push({ ...activeQuest, objectives });
      if (changed) {
        progressed.push(activeQuest.questId);
      }
    }
  }

  return {
    doc: { ...doc, active: nextActive, completed: [...doc.completed, ...newlyCompleted] },
    progressed,
    completedNow,
  };
}
