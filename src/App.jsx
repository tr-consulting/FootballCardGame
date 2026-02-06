import { useEffect, useMemo, useState } from "react";
import Card from "./components/Card";
import { formations } from "./lib/formations";
import { buildMockCards, mockStadiums } from "./lib/mockData";
import { fetchPlayersFromApi, fetchStadiumsFromApi, getApiKey } from "./lib/apiFootball";
import { computeOverall, positionWeights } from "./lib/ratings";
import {
  defaultState,
  ensureDailyReset,
  getAvailablePacks,
  loadState,
  saveState,
  consumePack,
} from "./lib/storage";
import { formatNumber } from "./lib/utils";
import { packCostTokens, rewardTokens } from "./lib/economy";
import { buildSummary, pickScorers, simulateMatch } from "./lib/matchSim";

const views = [
  { id: "packs", label: "Packs" },
  { id: "collection", label: "Collection" },
  { id: "team", label: "Team Builder" },
  { id: "match", label: "Match" },
  { id: "shop", label: "Shop" },
  { id: "admin", label: "Admin" },
];

const createTeam = () => ({
  id: `team-${Date.now()}`,
  name: "My Heroes",
  formationId: "4-4-2",
  kit: {
    home: { primary: "#ff6b35", secondary: "#fff3d6", pattern: "stripes" },
    away: { primary: "#2f80ed", secondary: "#e0f1ff", pattern: "waves" },
  },
  lineup: formations
    .find((formation) => formation.id === "4-4-2")
    .slots.map((slot) => ({ slotId: slot.positionKey, cardId: null })),
});

export default function App() {
  const [state, setState] = useState(() => ensureDailyReset(loadState()));
  const [activeView, setActiveView] = useState("packs");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedStadiumId, setSelectedStadiumId] = useState(null);

  const cardsById = useMemo(() => {
    const map = {};
    state.inventory.cards.forEach((card) => {
      map[card.id] = card;
    });
    return map;
  }, [state.inventory.cards]);

  const selectedTeam = state.teams.find((team) => team.id === selectedTeamId) ?? state.teams[0];
  const selectedFormation = formations.find((formation) => formation.id === selectedTeam?.formationId);
  const selectedStadium = state.stadiums.find((stadium) => stadium.id === selectedStadiumId) ?? state.stadiums[0];

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (state.teams.length === 0) {
      const team = createTeam();
      setState((prev) => ({ ...prev, teams: [team] }));
      setSelectedTeamId(team.id);
    }
  }, [state.teams.length]);

  useEffect(() => {
    if (state.stadiums.length === 0 && state.settings.useLiveApi) {
      fetchStadiums();
    }
  }, [state.stadiums.length, state.settings.useLiveApi]);

  const updateState = (patch) => {
    setState((prev) => ensureDailyReset({ ...prev, ...patch }));
  };

  const fetchStadiums = async () => {
    try {
      setLoading(true);
      const stadiums = await fetchStadiumsFromApi(state.settings);
      updateState({ stadiums: stadiums.length ? stadiums : mockStadiums });
      setMessage("Stadiums loaded!");
    } catch (err) {
      updateState({ stadiums: mockStadiums });
      setMessage("Using starter stadiums for now.");
      console.warn(err);
    } finally {
      setLoading(false);
    }
  };

  const openPack = async () => {
    setError("");
    setMessage("");

    const available = getAvailablePacks(state.inventory);
    if (available <= 0) {
      setError("No packs left today! Win matches or visit the shop.");
      return;
    }

    setLoading(true);
    try {
      const cards = state.settings.useLiveApi
        ? await fetchPlayersFromApi({ ...state.settings, count: 12 })
        : buildMockCards();

      updateState({
        inventory: {
          ...consumePack(state.inventory),
          cards: [...cards, ...state.inventory.cards],
        },
      });
      setMessage("Pack opened! 12 new heroes joined your club.");
    } catch (err) {
      console.warn(err);
      const cards = buildMockCards();
      updateState({
        inventory: {
          ...consumePack(state.inventory),
          cards: [...cards, ...state.inventory.cards],
        },
      });
      setMessage("Pack opened with starter heroes (API was busy).");
    } finally {
      setLoading(false);
    }
  };

  const buyPack = () => {
    if (state.inventory.tokens < packCostTokens) {
      setError("Not enough tokens yet.");
      return;
    }
    updateState({
      inventory: {
        ...state.inventory,
        tokens: state.inventory.tokens - packCostTokens,
        purchasedPacks: state.inventory.purchasedPacks + 1,
      },
    });
    setMessage("Pack bought! Ready to open.");
  };

  const createNewTeam = () => {
    const team = createTeam();
    updateState({ teams: [...state.teams, team] });
    setSelectedTeamId(team.id);
  };

  const updateTeam = (teamId, patch) => {
    updateState({
      teams: state.teams.map((team) => (team.id === teamId ? { ...team, ...patch } : team)),
    });
  };

  const updateLineup = (slotId, cardId) => {
    if (!selectedTeam) return;
    const updated = selectedTeam.lineup.map((slot) =>
      slot.slotId === slotId ? { ...slot, cardId } : slot
    );
    updateTeam(selectedTeam.id, { lineup: updated });
  };

  const runMatch = () => {
    if (!selectedTeam || !selectedFormation) return;
    const awayTeam = {
      id: "cpu",
      name: "Robo Strikers",
      formationId: "4-3-3",
      lineup: selectedFormation.slots.map((slot, index) => {
        const card = state.inventory.cards[index];
        return { slotId: slot.positionKey, cardId: card?.id ?? null };
      }),
    };

    const formationAway = formations.find((formation) => formation.id === awayTeam.formationId) ?? formations[0];
    const result = simulateMatch({
      homeTeam: selectedTeam,
      awayTeam,
      formationHome: selectedFormation,
      formationAway,
      cardsById,
      stadium: selectedStadium,
      seed: Date.now(),
    });

    const scorersHome = pickScorers(selectedTeam, result.homeGoals, cardsById, Date.now() + 1);
    const scorersAway = pickScorers(awayTeam, result.awayGoals, cardsById, Date.now() + 2);

    let reward = rewardTokens.draw;
    if (result.homeGoals > result.awayGoals) reward = rewardTokens.win;
    if (result.homeGoals < result.awayGoals) reward = rewardTokens.lose;

    const match = {
      id: `match-${Date.now()}`,
      homeTeamId: selectedTeam.id,
      awayTeamId: awayTeam.id,
      stadiumId: selectedStadium?.id,
      score: { home: result.homeGoals, away: result.awayGoals },
      scorers: [...scorersHome, ...scorersAway],
      summary: buildSummary(selectedTeam.name, awayTeam.name, result.homeGoals, result.awayGoals, selectedStadium),
      tokensAwarded: { winner: reward, loser: rewardTokens.lose },
      createdAt: new Date().toISOString(),
    };

    updateState({
      matchHistory: [match, ...state.matchHistory],
      inventory: {
        ...state.inventory,
        tokens: state.inventory.tokens + reward,
      },
    });

    setMessage(`Match complete! You earned ${reward} tokens.`);
  };

  const renderRatingFormula = () => (
    <div className="formula">
      <h3>Overall Rating Formula</h3>
      <p>
        Each overall rating is a weighted average of five stats. Weights change by position so goalkeepers value defense and
        physical more, while attackers value pace and shooting.
      </p>
      <div className="formula-grid">
        {Object.entries(positionWeights).map(([pos, weights]) => (
          <div key={pos}>
            <strong>{pos}</strong>
            <ul>
              {Object.entries(weights).map(([stat, weight]) => (
                <li key={stat}>
                  {stat}: {Math.round(weight * 100)}%
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );

  const availablePacks = getAvailablePacks(state.inventory);

  return (
    <div className="app">
      <header className="top-bar">
        <div>
          <h1>Football Card Game</h1>
          <p className="subtitle">Build your dream team. Play. Collect. Repeat.</p>
        </div>
        <div className="stat-pill">
          <span>Tokens</span>
          <strong>{formatNumber(state.inventory.tokens)}</strong>
        </div>
      </header>

      <nav className="nav">
        {views.map((view) => (
          <button
            key={view.id}
            className={activeView === view.id ? "active" : ""}
            onClick={() => setActiveView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {message && <div className="message success">{message}</div>}
      {error && <div className="message error">{error}</div>}

      {activeView === "packs" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Daily Packs</h2>
            <div className="stat-pill">
              <span>Available</span>
              <strong>{availablePacks}</strong>
            </div>
          </div>
          <p>Open 2 free packs per day. Win matches or buy extra packs with tokens.</p>
          <div className="pack-area">
            <div className={`pack ${loading ? "opening" : ""}`}>
              <span>12 Cards</span>
              <strong>Daily Pack</strong>
            </div>
            <button disabled={loading} onClick={openPack}>
              {loading ? "Opening..." : "Open Pack"}
            </button>
          </div>
          {renderRatingFormula()}
        </section>
      )}

      {activeView === "collection" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Your Collection</h2>
            <p>{state.inventory.cards.length} cards collected</p>
          </div>
          <div className="collection-grid">
            {state.inventory.cards.map((card) => (
              <Card key={card.id} card={card} />
            ))}
          </div>
        </section>
      )}

      {activeView === "team" && selectedTeam && (
        <section className="panel">
          <div className="panel-header">
            <h2>Team Builder</h2>
            <div className="team-actions">
              <select
                value={selectedTeam.id}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                {state.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <button onClick={createNewTeam}>New Team</button>
            </div>
          </div>

          <div className="team-settings">
            <label>
              Team name
              <input
                value={selectedTeam.name}
                onChange={(event) => updateTeam(selectedTeam.id, { name: event.target.value })}
              />
            </label>
            <label>
              Formation
              <select
                value={selectedTeam.formationId}
                onChange={(event) => {
                  const formationId = event.target.value;
                  const formation = formations.find((item) => item.id === formationId);
                  updateTeam(selectedTeam.id, {
                    formationId,
                    lineup: formation.slots.map((slot) => ({ slotId: slot.positionKey, cardId: null })),
                  });
                }}
              >
                {formations.map((formation) => (
                  <option key={formation.id} value={formation.id}>
                    {formation.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="pitch">
            {selectedFormation?.slots.map((slot) => {
              const lineupSlot = selectedTeam.lineup.find((item) => item.slotId === slot.positionKey);
              const card = lineupSlot?.cardId ? cardsById[lineupSlot.cardId] : null;
              const outOfPosition = card && card.position !== slot.role;

              return (
                <div
                  key={slot.positionKey}
                  className={`pitch-slot ${outOfPosition ? "warning" : ""}`}
                  style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    const cardId = event.dataTransfer.getData("text/plain");
                    updateLineup(slot.positionKey, cardId);
                  }}
                >
                  <div className="slot-role">{slot.positionKey}</div>
                  {card ? (
                    <div className="slot-card">{card.name}</div>
                  ) : (
                    <div className="slot-empty">Drop card</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="collection-grid compact">
            {state.inventory.cards.map((card) => (
              <Card
                key={card.id}
                card={card}
                compact
                onDragStart={(event, draggedCard) => {
                  event.dataTransfer.setData("text/plain", draggedCard.id);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {activeView === "match" && selectedTeam && (
        <section className="panel">
          <div className="panel-header">
            <h2>Match Day</h2>
            <p>Pick a stadium and simulate a match.</p>
          </div>

          <div className="match-controls">
            <label>
              Stadium
              <select
                value={selectedStadium?.id ?? ""}
                onChange={(event) => setSelectedStadiumId(Number(event.target.value))}
              >
                {state.stadiums.map((stadium) => (
                  <option key={stadium.id} value={stadium.id}>
                    {stadium.name} ({formatNumber(stadium.capacity)})
                  </option>
                ))}
              </select>
            </label>
            <button onClick={runMatch}>Simulate Match</button>
          </div>

          <div className="match-history">
            {state.matchHistory.map((match) => (
              <div key={match.id} className="match-card">
                <strong>
                  {selectedTeam.name} {match.score.home} - {match.score.away} Robo Strikers
                </strong>
                <p>{match.summary}</p>
                <small>{new Date(match.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeView === "shop" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Token Shop</h2>
            <p>Use tokens to buy extra packs.</p>
          </div>
          <div className="shop-grid">
            <div className="shop-card">
              <h3>Extra Pack</h3>
              <p>12 cards. No daily limit.</p>
              <div className="price">{packCostTokens} tokens</div>
              <button onClick={buyPack}>Buy Pack</button>
            </div>
          </div>
        </section>
      )}

      {activeView === "admin" && (
        <section className="panel">
          <div className="panel-header">
            <h2>Admin Panel</h2>
            <p>Parent controls and API settings.</p>
          </div>
          <div className="admin-grid">
            <div className="admin-card">
              <h3>Grant Packs</h3>
              <button
                onClick={() =>
                  updateState({
                    inventory: {
                      ...state.inventory,
                      adminGrantedPacks: state.inventory.adminGrantedPacks + 1,
                    },
                  })
                }
              >
                Grant 1 Pack
              </button>
              <button
                onClick={() =>
                  updateState({
                    inventory: {
                      ...state.inventory,
                      dailyPacksOpened: 0,
                    },
                  })
                }
              >
                Reset Daily Limit
              </button>
            </div>

            <div className="admin-card">
              <h3>API Settings</h3>
              <label>
                API Key
                <input
                  defaultValue={getApiKey()}
                  onBlur={(event) => localStorage.setItem("footballApiKey", event.target.value)}
                />
              </label>
              <label>
                League ID
                <input
                  type="number"
                  value={state.settings.league}
                  onChange={(event) => updateState({ settings: { ...state.settings, league: Number(event.target.value) } })}
                />
              </label>
              <label>
                Season
                <input
                  type="number"
                  value={state.settings.season}
                  onChange={(event) => updateState({ settings: { ...state.settings, season: Number(event.target.value) } })}
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.settings.useLiveApi}
                  onChange={(event) => updateState({ settings: { ...state.settings, useLiveApi: event.target.checked } })}
                />
                Use Live API Data
              </label>
              <button onClick={fetchStadiums}>Reload Stadiums</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
