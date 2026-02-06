import { formations } from "./formations";
import { todayISO } from "./utils";

const STORAGE_KEY = "footballCardGameState";

export const defaultState = {
  inventory: {
    cards: [],
    dailyPacksOpened: 0,
    adminGrantedPacks: 0,
    purchasedPacks: 0,
    tokens: 200,
    lastDailyReset: todayISO(),
  },
  teams: [],
  formations,
  stadiums: [],
  matchHistory: [],
  settings: {
    league: 39,
    season: 2023,
    useLiveApi: true,
  },
};

export const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      inventory: { ...defaultState.inventory, ...parsed.inventory },
      settings: { ...defaultState.settings, ...parsed.settings },
    };
  } catch (error) {
    console.warn("Failed to load state", error);
    return defaultState;
  }
};

export const saveState = (state) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const ensureDailyReset = (state) => {
  const today = todayISO();
  if (state.inventory.lastDailyReset !== today) {
    return {
      ...state,
      inventory: {
        ...state.inventory,
        dailyPacksOpened: 0,
        lastDailyReset: today,
      },
    };
  }
  return state;
};

export const getAvailablePacks = (inventory) => {
  const dailyLeft = Math.max(0, 2 - inventory.dailyPacksOpened);
  return dailyLeft + inventory.adminGrantedPacks + inventory.purchasedPacks;
};

export const consumePack = (inventory) => {
  if (inventory.purchasedPacks > 0) {
    return { ...inventory, purchasedPacks: inventory.purchasedPacks - 1 };
  }
  if (inventory.adminGrantedPacks > 0) {
    return { ...inventory, adminGrantedPacks: inventory.adminGrantedPacks - 1 };
  }
  return { ...inventory, dailyPacksOpened: inventory.dailyPacksOpened + 1 };
};
