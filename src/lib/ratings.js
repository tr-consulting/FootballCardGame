import { clamp, seededRandom } from "./utils";

export const positionWeights = {
  GK: { pace: 0.1, shooting: 0.05, passing: 0.15, defense: 0.45, physical: 0.25 },
  DEF: { pace: 0.15, shooting: 0.05, passing: 0.15, defense: 0.4, physical: 0.25 },
  MID: { pace: 0.2, shooting: 0.2, passing: 0.3, defense: 0.2, physical: 0.1 },
  ATT: { pace: 0.25, shooting: 0.4, passing: 0.15, defense: 0.1, physical: 0.1 },
};

export const computeOverall = (stats, role) => {
  const weights = positionWeights[role] ?? positionWeights.MID;
  const raw = Object.keys(weights).reduce((sum, key) => sum + stats[key] * weights[key], 0);
  return Math.round(clamp(raw, 0, 99));
};

// Derive kid-friendly stats from API data while keeping them stable per player.
export const deriveStatsFromApi = ({ baseRating, position, seed }) => {
  const rand = seededRandom(seed);
  const base = clamp(baseRating ?? 70, 40, 92);
  const jitter = () => Math.round((rand() - 0.5) * 12);

  const templateByPos = {
    GK: { pace: 50, shooting: 30, passing: 55, defense: 82, physical: 78 },
    DEF: { pace: 60, shooting: 40, passing: 55, defense: 78, physical: 75 },
    MID: { pace: 70, shooting: 65, passing: 78, defense: 60, physical: 65 },
    ATT: { pace: 78, shooting: 82, passing: 62, defense: 45, physical: 68 },
  };

  const template = templateByPos[position] ?? templateByPos.MID;
  const stats = {
    pace: clamp(template.pace + (base - 70) + jitter(), 25, 99),
    shooting: clamp(template.shooting + (base - 70) + jitter(), 25, 99),
    passing: clamp(template.passing + (base - 70) + jitter(), 25, 99),
    defense: clamp(template.defense + (base - 70) + jitter(), 25, 99),
    physical: clamp(template.physical + (base - 70) + jitter(), 25, 99),
  };

  return stats;
};

export const positionSuitability = (cardPosition, slotRole) => {
  if (cardPosition === slotRole) return 1;
  if (slotRole === "DEF" && cardPosition === "MID") return 0.92;
  if (slotRole === "MID" && cardPosition === "DEF") return 0.9;
  if (slotRole === "MID" && cardPosition === "ATT") return 0.92;
  if (slotRole === "ATT" && cardPosition === "MID") return 0.9;
  if (slotRole === "GK") return 0.75;
  return 0.85;
};
