import { COLLECTIONS, STORAGE_KEY } from '@atlas/contracts';
import type { MatchEvent, MatchEventType } from '@atlas/contracts';
import { readDoc, writeDoc } from '../storage';
import { applyEvents } from '../questEngine';
import { TEST_QUESTS } from '../questCatalog';

/**
 * Internal-only bookkeeping collection (not one of contracts.COLLECTIONS —
 * it's never read by a client, only by this RPC, so permissionRead is 0).
 * Tracks, per user, the last-applied `seq` per matchId so a duplicate/
 * replayed batch from Colyseus is a safe no-op.
 */
const QUESTS_SEQ_COLLECTION = 'quests_seq';
const MATCH_EVENT_TYPES: MatchEventType[] = ['MOB_KILLED', 'ITEM_PICKED_UP', 'ZONE_ENTERED'];

interface ReportMatchEventsPayload {
  userId: string;
  matchId: string;
  seq: number;
  events: MatchEvent[];
}

function parseEvent(raw: unknown): MatchEvent {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('report_match_events: each event must be a JSON object');
  }
  const { type, userId, targetId, count } = raw as Record<string, unknown>;
  if (typeof type !== 'string' || !MATCH_EVENT_TYPES.includes(type as MatchEventType)) {
    throw new Error(`report_match_events: event.type must be one of ${MATCH_EVENT_TYPES.join(', ')}`);
  }
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('report_match_events: event.userId must be a non-empty string');
  }
  if (typeof targetId !== 'string' || targetId.length === 0) {
    throw new Error('report_match_events: event.targetId must be a non-empty string');
  }
  if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
    throw new Error('report_match_events: event.count must be a positive integer');
  }
  return { type: type as MatchEventType, userId, targetId, count };
}

function parsePayload(raw: string): ReportMatchEventsPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('report_match_events: payload is not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('report_match_events: payload must be a JSON object');
  }
  const { userId, matchId, seq, events } = parsed as Record<string, unknown>;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('report_match_events: userId must be a non-empty string');
  }
  if (typeof matchId !== 'string' || matchId.length === 0) {
    throw new Error('report_match_events: matchId must be a non-empty string');
  }
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    throw new Error('report_match_events: seq must be a non-negative integer');
  }
  if (!Array.isArray(events)) {
    throw new Error('report_match_events: events must be an array');
  }
  return { userId, matchId, seq, events: events.map(parseEvent) };
}

interface SeqDoc {
  [matchId: string]: number;
}

function readSeqDoc(nk: nkruntime.Nakama, userId: string): { doc: SeqDoc; version: string } {
  const objects = nk.storageRead([{ collection: QUESTS_SEQ_COLLECTION, key: STORAGE_KEY, userId }]);
  if (objects.length === 0) {
    return { doc: {}, version: '*' };
  }
  return { doc: objects[0].value as SeqDoc, version: objects[0].version };
}

/**
 * report_match_events — S2S only. Idempotent: a batch whose `seq` is <= the
 * last-applied seq for that matchId is a no-op (`{deduped:true}`). Folds
 * new events into the player's quest progress via questEngine.applyEvents
 * and sends realtime notifications (code 1 = progress, code 2 = completed).
 */
export const reportMatchEvents: nkruntime.RpcFunction = function (
  ctx: nkruntime.Context,
  _logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  if (ctx.userId) {
    throw new Error(
      'report_match_events is server-only (S2S http_key) and cannot be called by an authenticated client',
    );
  }
  const { userId, matchId, seq, events } = parsePayload(payload);

  const seqRead = readSeqDoc(nk, userId);
  const lastSeq = seqRead.doc[matchId] ?? -1;
  if (seq <= lastSeq) {
    return JSON.stringify({ deduped: true });
  }

  const questsRead = readDoc(nk, userId, COLLECTIONS.quests);
  const { doc: updatedQuests, progressed, completedNow } = applyEvents(questsRead.doc, TEST_QUESTS, events);
  writeDoc(nk, userId, COLLECTIONS.quests, updatedQuests, questsRead.version);

  const updatedSeqDoc: SeqDoc = { ...seqRead.doc, [matchId]: seq };
  nk.storageWrite([
    {
      collection: QUESTS_SEQ_COLLECTION,
      key: STORAGE_KEY,
      userId,
      value: updatedSeqDoc,
      version: seqRead.version,
      permissionRead: 0,
      permissionWrite: 0,
    },
  ]);

  for (const questId of progressed) {
    const objectives = updatedQuests.active.find((q) => q.questId === questId)?.objectives ?? {};
    nk.notificationSend(userId, 'quest_progress', { questId, objectives }, 1);
  }
  for (const questId of completedNow) {
    nk.notificationSend(userId, 'quest_progress', { questId }, 2);
  }

  return JSON.stringify({ deduped: false, progressed, completedNow });
};
