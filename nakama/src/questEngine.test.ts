import type { MatchEvent, QuestsDoc } from '@atlas/contracts';
import { applyEvents, type QuestDef } from './questEngine';

const BOAR_HUNT: QuestDef = {
  id: 'q_boar_5',
  objectives: [{ id: 'kill_boars', type: 'MOB_KILLED', targetId: 'boar', required: 5 }],
  rewards: { xp: 100, items: [{ itemId: 'health_potion', qty: 1 }] },
};

function docWithActiveBoarHunt(): QuestsDoc {
  return {
    schemaVersion: 1,
    active: [{ questId: 'q_boar_5', startedAt: 0, objectives: { kill_boars: 0 } }],
    completed: [],
  };
}

function killEvents(count: number, targetId = 'boar'): MatchEvent[] {
  return [{ type: 'MOB_KILLED', userId: 'u1', targetId, count }];
}

describe('applyEvents', () => {
  it('progresses an active quest without completing it (3/5)', () => {
    const result = applyEvents(docWithActiveBoarHunt(), [BOAR_HUNT], killEvents(3));
    expect(result.progressed).toEqual(['q_boar_5']);
    expect(result.completedNow).toEqual([]);
    expect(result.doc.active).toEqual([{ questId: 'q_boar_5', startedAt: 0, objectives: { kill_boars: 3 } }]);
    expect(result.doc.completed).toEqual([]);
  });

  it('completes and moves the quest to completed at 5/5', () => {
    const result = applyEvents(docWithActiveBoarHunt(), [BOAR_HUNT], killEvents(5));
    expect(result.completedNow).toEqual(['q_boar_5']);
    expect(result.progressed).toEqual([]);
    expect(result.doc.active).toEqual([]);
    expect(result.doc.completed).toHaveLength(1);
    expect(result.doc.completed[0]).toMatchObject({ questId: 'q_boar_5', claimed: false });
  });

  it('ignores events for a quest that is not active', () => {
    const doc: QuestsDoc = { schemaVersion: 1, active: [], completed: [] };
    const result = applyEvents(doc, [BOAR_HUNT], killEvents(5));
    expect(result.progressed).toEqual([]);
    expect(result.completedNow).toEqual([]);
    expect(result.doc).toEqual(doc);
  });

  it('ignores events whose targetId does not match the objective', () => {
    const result = applyEvents(docWithActiveBoarHunt(), [BOAR_HUNT], killEvents(5, 'wolf'));
    expect(result.progressed).toEqual([]);
    expect(result.doc.active[0].objectives.kill_boars).toBe(0);
  });

  it('never overshoots the required count', () => {
    const result = applyEvents(docWithActiveBoarHunt(), [BOAR_HUNT], killEvents(9));
    expect(result.completedNow).toEqual(['q_boar_5']);
  });

  it('does not mutate the input doc', () => {
    const doc = docWithActiveBoarHunt();
    const before = JSON.parse(JSON.stringify(doc));
    applyEvents(doc, [BOAR_HUNT], killEvents(3));
    expect(doc).toEqual(before);
  });
});
