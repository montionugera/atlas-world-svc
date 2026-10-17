import bestiaryNames from '../data/bestiaryNames.json';

const BESTIARY_NAMES: Record<string, string> = bestiaryNames;

/** "mob-brand-new-thing" -> "Brand New Thing" (types not yet in the generated name table). */
const titleFromId = (id: string): string =>
    id
        .replace(/^mob-/, '')
        .split(/[-_]/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

export const getMobDisplayName = (mob: any) => {
    // First try to use the type ID which maps to config
    if (mob.mobTypeId) {
        // server-rs sends bestiary ids (content/bestiary/bestiary.json).
        const bestiaryName = BESTIARY_NAMES[mob.mobTypeId];
        if (bestiaryName) return bestiaryName;
        switch(mob.mobTypeId) {
            case 'spear_thrower': return 'Spear Thrower';
            case 'hybrid': return 'Hybrid Fighter';
            case 'aggressive': return 'Aggressive Mob';
            case 'defensive': return 'Defensive Mob';
            case 'balanced': return 'Balanced Mob';
            case 'double_attacker': return 'Double Attacker';
            default: return mob.mobTypeId.startsWith('mob-') ? titleFromId(mob.mobTypeId) : mob.mobTypeId;
        }
    }
    
    // Fallback/Legacy checks
    if (mob.type) return mob.type;
    return 'Unknown Mob';
};

export const getMobStatusText = (mob: any): string => {
    const statuses: string[] = [];
    
    // 1. Behavior (e.g. "Attack", "Chase")
    if (mob.tag) {
        statuses.push(mob.tag.toUpperCase());
    }

    // 2. Battle Statuses (e.g. "Stunned")
    if (mob.battleStatuses) {
        // mob.battleStatuses is a Schema Map, so we iterate keys or entries
        // In Colyseus.js client, it's often a Map or Schema object.
        // Assuming it acts like a JS Map for now based on other code.
        mob.battleStatuses.forEach((status: any, key: string) => {
             statuses.push(key.toUpperCase());
        });
    }

    if (statuses.length === 0) return '';
    return `[${statuses.join(', ')}]`;
};
