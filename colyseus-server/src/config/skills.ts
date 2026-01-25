export interface SkillEffect {

  type: 'damage' | 'heal' | 'freeze' | 'stun' | 'impulse_caster';
  value: number;
  chance?: number; // 0.0 to 1.0 (default 1.0)
  duration?: number;
  interval?: number;
}

export interface SkillDefinition {
  id: string;
  name: string;
  radius: number;
  effects: SkillEffect[];
  tickRate: number;
  skillCastingTime: number; // ms
  duration: number; // ms
  
  // New Cooldown System
  // Keys to check: fail if ANY are active
  consideringCooldown: string[]; 
  // Keys to set: map KEY -> DURATION (ms)
  cooldownSetting: Record<string, number>;
}

export const GLOBAL_MAGIC_CD_KEY = 'global_magic_cd';

// Helper to standard magic setup
const standardMagicConfig = (skillId: string, cooldown: number, gcd: number) => ({
    consideringCooldown: [skillId, GLOBAL_MAGIC_CD_KEY],
    cooldownSetting: { 
        [skillId]: cooldown, 
        [GLOBAL_MAGIC_CD_KEY]: gcd 
    }
});

export const SKILLS: Record<string, SkillDefinition> = {
  'skill_1': {
    id: 'skill_1',
    name: 'Meteor Strike',
    radius: 6,
    effects: [
      { type: 'damage', value: 2 }
    ],
    tickRate: 200,
    skillCastingTime: 1500, // 1.5s
    duration: 5000, // 5s
    ...standardMagicConfig('skill_1', 5000, 5000)
  },
  'skill_2': {
    id: 'skill_2',
    name: 'Precision Strike',
    radius: 2,
    effects: [
       { type: 'damage', value: 5 },
    ],
    tickRate: 200,
    skillCastingTime: 1000, // 1s
    duration: 5000, // 5s
    ...standardMagicConfig('skill_2', 2000, 1000)
  },
  'skill_3': {
    id: 'skill_3',
    name: 'Blizzard',
    radius: 5,
    effects: [
       { type: 'damage', value: 3 },
       { type: 'freeze', duration: 5000, value: 0.2, chance: 1 } // ❄️ 100% chance to freeze for 10s. Value 0.2 = Speed Multiplier
    ],
    tickRate: 200,
    skillCastingTime: 1000, // 2s cast
    duration: 3000, // 10s duration
    ...standardMagicConfig('skill_3', 4000, 1500)
  },
  'skill_4': {
    id: 'skill_4',
    name: 'Thunder Strike',
    radius: 4, 
    effects: [
       { type: 'damage', value: 2 },
       { type: 'stun', duration: 1200, value: 0, chance: 1 } // 💫 Stun for 2s
    ],
    tickRate: 2000,   // Instant hit (no DOT)
    skillCastingTime: 500, // 0.5s cast
    duration: 15000, // Short duration just for visuals
    ...standardMagicConfig('skill_4', 5000, 1000)
  },
  'skill_dash': {
    id: 'skill_dash',
    name: 'Dash',
    radius: 0, 
    effects: [
       { type: 'impulse_caster', value: 160 } // Impulse multiplier
    ],
    tickRate: 0,
    skillCastingTime: 0, // Instant
    duration: 0,
    // DASH CONFIG: Only cares about its own cooldown. Ignores Magic GCD.
    consideringCooldown: ['skill_dash'],
    cooldownSetting: {
        'skill_dash': 500
    }
  }
};
