export interface SkillConfig {
  id: string;
  name: string;
  slot: number;
  keyLabel: string;
  icon: string;
  castTime: number; // in seconds
  cooldown: number; // in seconds
  gcd: number; // in seconds
  color: string;
  description: string;
}

export const SKILL_DEFINITIONS: Record<string, SkillConfig> = {
  skill_1: {
    id: "skill_1",
    name: "Meteor Strike",
    slot: 1,
    keyLabel: "1",
    icon: "🔥",
    castTime: 1.5,
    cooldown: 5.0,
    gcd: 5.0,
    color: "#e67e22",
    description: "Launches a fiery meteor dealing 20 magical fire damage.",
  },
  skill_2: {
    id: "skill_2",
    name: "Precision Strike",
    slot: 2,
    keyLabel: "2",
    icon: "🪨",
    castTime: 1.0,
    cooldown: 2.0,
    gcd: 1.0,
    color: "#8e44ad",
    description: "A focused strike dealing 50 physical earth damage.",
  },
  skill_3: {
    id: "skill_3",
    name: "Blizzard",
    slot: 3,
    keyLabel: "3",
    icon: "❄️",
    castTime: 1.0,
    cooldown: 4.0,
    gcd: 1.5,
    color: "#3498db",
    description:
      "Freezes enemies dealing 30 magical water damage and slows for 5s.",
  },
  skill_4: {
    id: "skill_4",
    name: "Thunder Strike",
    slot: 4,
    keyLabel: "4",
    icon: "⚡",
    castTime: 0.5,
    cooldown: 5.0,
    gcd: 1.0,
    color: "#f1c40f",
    description:
      "Calls down lightning dealing 25 wind damage and stuns for 1.2s.",
  },
  skill_dash: {
    id: "skill_dash",
    name: "Dash",
    slot: 5,
    keyLabel: "Shift",
    icon: "💨",
    castTime: 0.0,
    cooldown: 0.5,
    gcd: 0.0,
    color: "#1abc9c",
    description: "Instant physical burst forward.",
  },
};

export const SKILL_NAMES: Record<string, string> = {
  skill_1: "Meteor Strike",
  skill_2: "Precision Strike",
  skill_3: "Blizzard",
  skill_4: "Thunder Strike",
  skill_dash: "Dash",
};
