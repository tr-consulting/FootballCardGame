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
  const weatherBoost = stadium?.modifiers?.weather === "rain" ? -0.8 : 0;

  const homeStrength =
    ratingHome + formationBoost + stadiumBoost + capacityBoost + weatherBoost + rand() * 4;
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
    formationBoost,
    stadiumBoost,
    capacityBoost,
    weatherBoost,
    homeStrength: Math.round(homeStrength * 10) / 10,
    awayStrength: Math.round(awayStrength * 10) / 10,
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
    scorers.push({ cardId: pick.id, name: pick.name, minute: Math.floor(rand() * 90) + 1 });
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

export const buildCommentary = ({
  homeName,
  awayName,
  homeGoals,
  awayGoals,
  stadium,
  formationBoost,
  stadiumBoost,
  capacityBoost,
  weatherBoost,
  momentum,
  scorersHome,
  scorersAway,
}) => {
  const lines = [];
  const venue = stadium?.name ?? "the stadium";
  lines.push(`Kickoff at ${venue}! The crowd is buzzing.`);

  if (formationBoost > 0) lines.push(`${homeName}'s formation gave them the edge early.`);
  if (formationBoost < 0) lines.push(`${awayName} looked sharper with their formation.`);
  if (stadiumBoost + capacityBoost > 1) lines.push(`Home advantage was a big boost today.`);
  if (weatherBoost < 0) lines.push(`Rain made passing tricky, so tackles were flying in.`);

  if (momentum === "home") lines.push(`${homeName} kept the pressure on with wave after wave of attacks.`);
  if (momentum === "away") lines.push(`${awayName} hit back with speedy counter attacks.`);
  if (momentum === "even") lines.push(`Both teams traded chances in a balanced battle.`);

  if (homeGoals > awayGoals) lines.push(`${homeName} celebrated a sweet ${homeGoals}-${awayGoals} win!`);
  if (awayGoals > homeGoals) lines.push(`${awayName} grabbed the win ${awayGoals}-${homeGoals}!`);
  if (homeGoals === awayGoals) lines.push(`It finished ${homeGoals}-${awayGoals}. A fair result!`);

  const scorersToText = (scorers) =>
    scorers
      .slice(0, 3)
      .map((scorer) => `${scorer.name} (${scorer.minute}')`)
      .join(", ");

  if (scorersHome.length || scorersAway.length) {
    const homeText = scorersHome.length ? scorersToText(scorersHome) : "no scorers";
    const awayText = scorersAway.length ? scorersToText(scorersAway) : "no scorers";
    lines.push(`Goals: ${homeName} - ${homeText}; ${awayName} - ${awayText}.`);
  }

  return lines.join(" ");
};
