import { clamp } from "./utils";
import { computeOverall, deriveStatsFromApi } from "./ratings";

const API_BASE = "https://v3.football.api-sports.io";
const DEFAULT_KEY = "8b1cf27a740f0fcfc05ffd6f58ef72c2";

export const getApiKey = () => {
  return (
    localStorage.getItem("footballApiKey") ||
    import.meta.env.VITE_API_FOOTBALL_KEY ||
    DEFAULT_KEY
  );
};

const apiFetch = async (path, apiKey) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-rapidapi-key": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text.slice(0, 120)}`);
  }

  return response.json();
};

const mapPosition = (raw) => {
  if (!raw) return "MID";
  const normalized = raw.toUpperCase();
  if (normalized.includes("GOALKEEPER") || normalized.includes("GK")) return "GK";
  if (normalized.includes("DEF")) return "DEF";
  if (normalized.includes("MID")) return "MID";
  if (normalized.includes("ATT") || normalized.includes("FOR")) return "ATT";
  return "MID";
};

const ratingFromStats = (statBlock) => {
  const raw = Number.parseFloat(statBlock?.games?.rating);
  if (Number.isFinite(raw)) return clamp(Math.round(raw * 10), 55, 94);

  const goals = statBlock?.goals?.total ?? 0;
  const assists = statBlock?.goals?.assists ?? 0;
  const passes = statBlock?.passes?.total ?? 0;
  const tackles = statBlock?.tackles?.total ?? 0;
  const duelsWon = statBlock?.duels?.won ?? 0;
  const base = 60 + goals * 2 + assists * 1.5 + passes / 120 + tackles / 40 + duelsWon / 50;
  return clamp(Math.round(base), 50, 90);
};

export const fetchPlayersFromApi = async ({ league = 39, season = 2023, count = 12 }) => {
  const apiKey = getApiKey();
  const meta = await apiFetch(`/players?league=${league}&season=${season}&page=1`, apiKey);
  const totalPages = Math.max(1, meta?.paging?.total ?? 1);
  const pagesNeeded = Math.min(3, Math.ceil(count / 8));

  const pageRequests = Array.from({ length: pagesNeeded }, () => {
    const page = Math.max(1, Math.floor(Math.random() * totalPages) + 1);
    return apiFetch(`/players?league=${league}&season=${season}&page=${page}`, apiKey);
  });

  const pageResults = await Promise.all(pageRequests);
  const players = pageResults.flatMap((result) => result?.response ?? []);

  return players.slice(0, count).map((item, index) => {
    const player = item.player;
    const statsBlock = item.statistics?.[0];
    const position = mapPosition(statsBlock?.games?.position);
    const baseRating = ratingFromStats(statsBlock);

    const stats = deriveStatsFromApi({
      baseRating,
      position,
      seed: player.id + index,
    });

    return {
      id: `card-${player.id}-${Date.now()}-${index}`,
      playerId: player.id,
      name: player.name,
      position,
      club: statsBlock?.team?.name ?? "Unknown Club",
      league: statsBlock?.league?.name ?? "Unknown League",
      imageUrl: player.photo,
      stats,
      overall: computeOverall(stats, position),
    };
  });
};

export const fetchStadiumsFromApi = async ({ league = 39, season = 2023 }) => {
  const apiKey = getApiKey();
  const data = await apiFetch(`/venues?league=${league}&season=${season}`, apiKey);
  const venues = data?.response ?? [];

  return venues.slice(0, 12).map((venue) => {
    const capacity = venue.capacity ?? 0;
    const capacityBonus = clamp(Math.round((capacity / 50000) * 2 * 10) / 10, 0, 2);
    const weatherRoll = venue.id % 3;
    const weather = weatherRoll === 0 ? "rain" : weatherRoll === 1 ? "sun" : "wind";

    return {
      id: venue.id,
      name: venue.name,
      city: venue.city,
      capacity,
      imageUrl: venue.image,
      modifiers: {
        homeAdvantage: 1 + capacityBonus * 0.4,
        capacityBonus,
        weather,
      },
    };
  });
};
