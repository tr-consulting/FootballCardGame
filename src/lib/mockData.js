import { computeOverall, deriveStatsFromApi } from "./ratings";

const mockPlayers = [
  {
    playerId: 1,
    name: "Alex Storm",
    position: "ATT",
    club: "Sky City",
    league: "Junior League",
    imageUrl: "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=400&auto=format&fit=crop&q=60",
    baseRating: 82,
  },
  {
    playerId: 2,
    name: "Maya Rocket",
    position: "MID",
    club: "Ocean Rovers",
    league: "Junior League",
    imageUrl: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400&auto=format&fit=crop&q=60",
    baseRating: 79,
  },
  {
    playerId: 3,
    name: "Leo Shield",
    position: "DEF",
    club: "Mountain FC",
    league: "Junior League",
    imageUrl: "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=400&auto=format&fit=crop&q=60",
    baseRating: 80,
  },
  {
    playerId: 4,
    name: "Sofia Keeper",
    position: "GK",
    club: "River United",
    league: "Junior League",
    imageUrl: "https://images.unsplash.com/photo-1508609349937-5ec4ae374ebf?w=400&auto=format&fit=crop&q=60",
    baseRating: 83,
  },
];

export const buildMockCards = () =>
  mockPlayers.map((player) => {
    const stats = deriveStatsFromApi({
      baseRating: player.baseRating,
      position: player.position,
      seed: player.playerId,
    });

    return {
      id: `mock-${player.playerId}`,
      playerId: player.playerId,
      name: player.name,
      position: player.position,
      club: player.club,
      league: player.league,
      imageUrl: player.imageUrl,
      stats,
      overall: computeOverall(stats, player.position),
    };
  });

export const mockStadiums = [
  {
    id: 101,
    name: "Spark Arena",
    city: "Sunville",
    capacity: 42000,
    modifiers: { homeAdvantage: 2, capacityBonus: 1, weather: "sun" },
  },
  {
    id: 102,
    name: "Blue Wave Stadium",
    city: "Harbor City",
    capacity: 36000,
    modifiers: { homeAdvantage: 1.5, capacityBonus: 0.8, weather: "wind" },
  },
  {
    id: 103,
    name: "Tiger Field",
    city: "Oak Town",
    capacity: 28000,
    modifiers: { homeAdvantage: 1, capacityBonus: 0.4, weather: "rain" },
  },
];
