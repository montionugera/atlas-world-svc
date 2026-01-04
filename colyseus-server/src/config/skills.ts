export interface SkillEffect {
  type: 'damage' | 'heal' | 'freeze' | 'stun';
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
  castTime: number; // ms
  duration: number; // ms
  cooldown: number; // ms
  gcd: number; // ms
}

export const SKILLS: Record<string, SkillDefinition> = {
  'skill_1': {
    id: 'skill_1',
    name: 'Meteor Strike',
    radius: 6,
    effects: [
      { type: 'damage', value: 2 }
    ],
    tickRate: 200,
    castTime: 1500, // 1.5s
    duration: 5000, // 5s
    cooldown: 5000, 
    gcd: 5000
  },
  'skill_2': {
    id: 'skill_2',
    name: 'Precision Strike',
    radius: 2,
    effects: [
       { type: 'damage', value: 5 },
    ],
    tickRate: 200,
    castTime: 1000, // 1s
    duration: 5000, // 5s
    cooldown: 2000,
    gcd: 1000
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
    castTime: 1000, // 2s cast
    duration: 3000, // 10s duration
    cooldown: 4000, // 20s cooldown
    gcd: 1500
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
    castTime: 500, // 0.5s cast
    duration: 15000, // Short duration just for visuals
    cooldown: 5000,
    gcd: 1000
  }
};
