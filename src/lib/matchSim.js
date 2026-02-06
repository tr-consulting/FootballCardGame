import { clamp, seededRandom } from "./utils";
import { positionSuitability } from "./ratings";

export const computeTeamRating = (team, cardsById, formation) => {
  let total = 0;
  let count = 0;
  let suitabilityBonus = 0;

  formation.slots.forEach((slot) => {
    const lineupSlot = team.lineup.find((item) => item.slotId === slot.positionKey);
    if (!lineupSlot?.cardId) return;
    const card = cardsById[lineupSlot.cardId];
    if (!card) return;
    count += 1;
    total += card.overall;
    suitabilityBonus += positionSuitability(card.position, slot.role);
  });

  if (count === 0) return 45;
  const base = total / count;
  const suitability = suitabilityBonus / count;
  return clamp(Math.round(base * suitability), 30, 99);
};

export const formationAdvantage = (homeFormationId, awayFormationId) => {
  if (homeFormationId === awayFormationId) return 0;
  const advantagePairs = {
    "4-4-2": "3-5-2",
    "3-5-2": "4-3-3",
    "4-3-3": "4-4-2",
  };
  if (advantagePairs[homeFormationId] === awayFormationId) return 2.5;
  if (advantagePairs[awayFormationId] === homeFormationId) return -2.5;
  return 0;
};

export const simulateMatch = ({
  homeTeam,
  awayTeam,
  formationHome,
  formationAway,
  cardsById,
  stadium,
  seed,
}) => {
  const rand = seededRandom(seed ?? Date.now());
  const ratingHome = computeTeamRating(homeTeam, cardsById, formationHome);
  const ratingAway = computeTeamRating(awayTeam, cardsById, formationAway);
  const formationBoost = formationAdvantage(formationHome.id, formationAway.id);
  const stadiumBoost = stadium?.modifiers?.homeAdvantage ?? 0;
  const capacityBoost = stadium?.modifiers?.capacityBonus ?? 0;

  const homeStrength = ratingHome + formationBoost + stadiumBoost + capacityBoost + rand() * 4;
  const awayStrength = ratingAway + rand() * 4;

  const expectedHomeGoals = clamp((homeStrength - awayStrength) / 12 + 1.2 + rand(), 0, 6);
  const expectedAwayGoals = clamp((awayStrength - homeStrength) / 12 + 1.1 + rand(), 0, 6);

  const homeGoals = Math.max(0, Math.round(expectedHomeGoals));
  const awayGoals = Math.max(0, Math.round(expectedAwayGoals));

  return {
    ratingHome,
    ratingAway,
    homeGoals,
    awayGoals,
  };
};

export const pickScorers = (team, goals, cardsById, seed) => {
  const rand = seededRandom(seed ?? Date.now());
  const attackers = team.lineup
    .map((slot) => cardsById[slot.cardId])
    .filter(Boolean)
    .filter((card) => card.position === "ATT" || card.position === "MID");

  const options = attackers.length ? attackers : team.lineup.map((slot) => cardsById[slot.cardId]).filter(Boolean);

  const scorers = [];
  for (let i = 0; i < goals; i += 1) {
    const pick = options[Math.floor(rand() * options.length)];
    if (!pick) continue;
    scorers.push({ cardId: pick.id, minute: Math.floor(rand() * 90) + 1 });
  }
  return scorers;
};

export const buildSummary = (homeName, awayName, homeGoals, awayGoals, stadium) => {
  if (homeGoals > awayGoals) {
    return `${homeName} were on fire at ${stadium?.name ?? "the stadium"}! They won ${homeGoals}-${awayGoals}.`;
  }
  if (awayGoals > homeGoals) {
    return `${awayName} surprised everyone and won ${awayGoals}-${homeGoals}!`;
  }
  return `It was a super close game at ${stadium?.name ?? "the stadium"}. ${homeName} and ${awayName} drew ${homeGoals}-${awayGoals}.`;
};
