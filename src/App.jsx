import { useEffect, useMemo, useState } from "react";
import Card from "./components/Card";
import { formations } from "./lib/formations";
import { buildMockCards, mockStadiums } from "./lib/mockData";
import { fetchCountriesFromApi, fetchPlayersFromApi, fetchStadiumsFromApi, getApiKey } from "./lib/apiFootball";
import { computeOverall, positionWeights } from "./lib/ratings";
import { buildHeroCards, heroPackCostTokens } from "./lib/heroes";
import {
  defaultState,
  ensureDailyReset,
  getAvailablePacks,
  getHeroPacks,
  loadState,
  saveState,
  consumePack,
  consumeHeroPack,
} from "./lib/storage";
import { formatNumber, latestSeasonYear } from "./lib/utils";
import { packCostTokens, rewardTokens } from "./lib/economy";
import { buildCommentary, buildMatchTimeline, buildSummary, pickScorers, simulateMatch } from "./lib/matchSim";

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
    home: {
      shirt: "#ff6b35",
      shorts: "#ffffff",
      socks: "#ffb067",
      pattern: "stripes",
    },
    away: {
      shirt: "#2f80ed",
      shorts: "#e0f1ff",
      socks: "#87c6ff",
      pattern: "waves",
    },
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
  const [lastOpenedCards, setLastOpenedCards] = useState([]);
  const [showPackReveal, setShowPackReveal] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [matchPhase, setMatchPhase] = useState("idle");
  const [pendingMatch, setPendingMatch] = useState(null);
  const [liveEvents, setLiveEvents] = useState([]);
  const [eventCursor, setEventCursor] = useState(0);
  const [liveMinute, setLiveMinute] = useState(0);
  const [chatLog, setChatLog] = useState([]);
  const [ballPos, setBallPos] = useState({ x: 50, y: 50 });

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
    if (state.settings.autoSeason) {
      const latest = latestSeasonYear();
      if (state.settings.season !== latest) {
        updateState({ settings: { ...state.settings, season: latest } });
      }
    }
  }, [state.settings.autoSeason]);

  useEffect(() => {
    const normalized = state.teams.map((team) => {
      const home = team.kit?.home ?? {};
      const away = team.kit?.away ?? {};
      const needsMigration = home.primary || away.primary || !home.shirt || !away.shirt;
      if (!needsMigration) return team;
      const normalizeSide = (side, fallback) => ({
        shirt: side.shirt ?? side.primary ?? fallback.shirt,
        shorts: side.shorts ?? side.secondary ?? fallback.shorts,
        socks: side.socks ?? side.secondary ?? fallback.socks,
        pattern: side.pattern ?? fallback.pattern,
      });
      return {
        ...team,
        kit: {
          home: normalizeSide(home, {
            shirt: "#ff6b35",
            shorts: "#ffffff",
            socks: "#ffb067",
            pattern: "stripes",
          }),
          away: normalizeSide(away, {
            shirt: "#2f80ed",
            shorts: "#e0f1ff",
            socks: "#87c6ff",
            pattern: "waves",
          }),
        },
      };
    });
    const changed = normalized.some((team, index) => team !== state.teams[index]);
    if (changed) {
      updateState({ teams: normalized });
    }
  }, [state.teams.length]);

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

  useEffect(() => {
    if (!pendingMatch || matchPhase !== "playing") return;
    if (!pendingMatch.timeline || pendingMatch.timeline.length === 0) return;

    const interval = setInterval(() => {
      setEventCursor((cursor) => {
        const nextIndex = cursor + 1;
        const event = pendingMatch.timeline[cursor];
        if (event) {
          setLiveEvents((events) => [...events, event]);
          setLiveMinute(event.minute);
          if (event.ball) {
            setBallPos(event.ball);
          }
        }
        if (nextIndex >= pendingMatch.timeline.length) {
          clearInterval(interval);
          setMatchPhase("finished");
        }
        return nextIndex;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [matchPhase, pendingMatch]);

  useEffect(() => {
    if (matchPhase !== "finished" || !pendingMatch) return;
    updateState({
      matchHistory: [pendingMatch.match, ...state.matchHistory],
      inventory: {
        ...state.inventory,
        tokens: state.inventory.tokens + pendingMatch.reward,
      },
    });
  }, [matchPhase]);

  useEffect(() => {
    if (!state.settings.useLiveApi) return;
    if (Object.keys(state.countryFlags).length > 0) return;
    fetchCountries();
  }, [state.settings.useLiveApi, state.countryFlags]);

  const updateState = (patch) => {
    setState((prev) => ensureDailyReset({ ...prev, ...patch }));
  };

  const fetchStadiums = async () => {
    try {
      setLoading(true);
      const season = state.settings.autoSeason ? latestSeasonYear() : state.settings.season;
      const stadiums = await fetchStadiumsFromApi({ ...state.settings, season });
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

  const fetchCountries = async () => {
    try {
      const flags = await fetchCountriesFromApi();
      if (Object.keys(flags).length) {
        updateState({ countryFlags: flags });
      }
    } catch (err) {
      console.warn(err);
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
      const season = state.settings.autoSeason ? latestSeasonYear() : state.settings.season;
      const cards = state.settings.useLiveApi
        ? await fetchPlayersFromApi({ ...state.settings, season, count: 12 })
        : buildMockCards();
      const cardsWithFlags = cards.map((card) => ({
        ...card,
        countryFlag: card.countryFlag ?? state.countryFlags[card.country],
      }));

      updateState({
        inventory: {
          ...consumePack(state.inventory),
          cards: [...cardsWithFlags, ...state.inventory.cards],
        },
      });
      setLastOpenedCards(cardsWithFlags);
      setShowPackReveal(true);
      setMessage("Pack opened! 12 new heroes joined your club.");
    } catch (err) {
      console.warn(err);
      const cards = buildMockCards();
      const cardsWithFlags = cards.map((card) => ({
        ...card,
        countryFlag: card.countryFlag ?? state.countryFlags[card.country],
      }));
      updateState({
        inventory: {
          ...consumePack(state.inventory),
          cards: [...cardsWithFlags, ...state.inventory.cards],
        },
      });
      setLastOpenedCards(cardsWithFlags);
      setShowPackReveal(true);
      setMessage("Pack opened with starter heroes (API was busy).");
    } finally {
      setLoading(false);
    }
  };

  const openHeroPack = () => {
    setError("");
    setMessage("");
    if ((state.inventory.heroPacks ?? 0) <= 0) {
      setError("No Hero packs available yet.");
      return;
    }
    const heroCards = buildHeroCards(12);
    updateState({
      inventory: {
        ...consumeHeroPack(state.inventory),
        cards: [...heroCards, ...state.inventory.cards],
      },
    });
    setLastOpenedCards(heroCards);
    setShowPackReveal(true);
    setMessage("Hero pack opened! Legendary cards unlocked.");
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

  const buyHeroPack = () => {
    if (state.inventory.tokens < heroPackCostTokens) {
      setError("Not enough tokens for a Hero pack.");
      return;
    }
    updateState({
      inventory: {
        ...state.inventory,
        tokens: state.inventory.tokens - heroPackCostTokens,
        heroPacks: (state.inventory.heroPacks ?? 0) + 1,
      },
    });
    setMessage("Hero pack bought! Open it when you're ready.");
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
    const opponentName = "Robo Strikers";
    const opponentFormation =
      formations.find((formation) => formation.id !== selectedFormation.id) ?? formations[0];
    const pool = state.inventory.cards.length ? state.inventory.cards : buildMockCards();
    const opponentCards = pool.slice(0, opponentFormation.slots.length);
    const awayTeam = {
      id: "cpu",
      name: opponentName,
      formationId: opponentFormation.id,
      lineup: opponentFormation.slots.map((slot, index) => {
        const card = opponentCards[index];
        return { slotId: slot.positionKey, cardId: card?.id ?? null };
      }),
    };

    const opponentKit = {
      shirt: "#2b2d42",
      shorts: "#8d99ae",
      socks: "#ef233c",
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

    let momentum = "even";
    if (result.homeStrength - result.awayStrength > 3) momentum = "home";
    if (result.awayStrength - result.homeStrength > 3) momentum = "away";

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
      commentary: buildCommentary({
        homeName: selectedTeam.name,
        awayName: awayTeam.name,
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        stadium: selectedStadium,
        formationBoost: result.formationBoost,
        stadiumBoost: result.stadiumBoost,
        capacityBoost: result.capacityBoost,
        weatherBoost: result.weatherBoost,
        momentum,
        scorersHome,
        scorersAway,
      }),
      tokensAwarded: { winner: reward, loser: rewardTokens.lose },
      createdAt: new Date().toISOString(),
    };

    const timeline = buildMatchTimeline({
      homeName: selectedTeam.name,
      awayName: awayTeam.name,
      scorersHome,
      scorersAway,
      seed: Date.now(),
    });

    setPendingMatch({
      match,
      reward,
      timeline,
      homeTeam: selectedTeam,
      awayTeam,
      formationHome: selectedFormation,
      formationAway,
      opponentKit,
    });
    setMatchPhase("preview");
    setLiveEvents([]);
    setEventCursor(0);
    setLiveMinute(0);
    setBallPos({ x: 50, y: 50 });
    setChatLog([]);
  };

  const startMatch = () => {
    setMatchPhase("playing");
    setLiveEvents([]);
    setEventCursor(0);
    setLiveMinute(0);
    setBallPos({ x: 50, y: 50 });
  };

  const sendTaunt = (text) => {
    setChatLog((log) => [...log, { from: "you", text }]);
    const responses = ["Bring it on!", "We will see.", "Nice try!", "Let the match decide."];
    setTimeout(() => {
      const reply = responses[Math.floor(Math.random() * responses.length)];
      setChatLog((log) => [...log, { from: "opponent", text: reply }]);
    }, 800);
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
  const heroPacks = getHeroPacks(state.inventory);

  return (
    <div className="app">
      {showPackReveal && (
        <div className="pack-reveal">
          <div className="pack-reveal-card">
            <div className="pack-reveal-header">
              <h2>New Cards!</h2>
              <button onClick={() => setShowPackReveal(false)}>Done</button>
            </div>
            <div className="pack-reveal-grid">
              {lastOpenedCards.map((card, index) => (
                <div
                  key={card.id}
                  className="reveal-item"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <Card card={card} compact countryFlags={state.countryFlags} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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
          <div className="pack-area">
            <div className="pack hero-pack">
              <span>12 Heroes</span>
              <strong>Hero Pack</strong>
              <small>{heroPacks} available</small>
            </div>
            <button disabled={heroPacks === 0} onClick={openHeroPack}>
              Open Hero Pack
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
          <div className="collection-filters">
            {["ALL", "GK", "DEF", "MID", "ATT"].map((filter) => (
              <button
                key={filter}
                className={collectionFilter === filter ? "active" : ""}
                onClick={() => setCollectionFilter(filter)}
              >
                {filter === "ALL" ? "All" : filter}
              </button>
            ))}
          </div>
          <div className="collection-grid">
            {state.inventory.cards
              .filter((card) => (collectionFilter === "ALL" ? true : card.position === collectionFilter))
              .map((card) => (
                <Card key={card.id} card={card} countryFlags={state.countryFlags} />
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

          <div className="kit-designer">
            <div className="kit-column">
              <h3>Home Kit</h3>
              <div className={`kit-preview ${selectedTeam.kit.home.pattern}`}>
                <div className="kit-figure">
                  <div className="kit-shirt" style={{ backgroundColor: selectedTeam.kit.home.shirt }}>
                    <span className="kit-collar" />
                    <span className="kit-sleeve left" />
                    <span className="kit-sleeve right" />
                  </div>
                  <div className="kit-shorts" style={{ backgroundColor: selectedTeam.kit.home.shorts }}>
                    <span className="kit-short-trim" />
                  </div>
                  <div className="kit-legs">
                    <div className="kit-sock" style={{ backgroundColor: selectedTeam.kit.home.socks }}>
                      <span className="kit-boot" />
                    </div>
                    <div className="kit-sock" style={{ backgroundColor: selectedTeam.kit.home.socks }}>
                      <span className="kit-boot" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="kit-controls">
                <label>
                  Shirt
                  <input
                    type="color"
                    value={selectedTeam.kit.home.shirt}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          home: { ...selectedTeam.kit.home, shirt: event.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Shorts
                  <input
                    type="color"
                    value={selectedTeam.kit.home.shorts}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          home: { ...selectedTeam.kit.home, shorts: event.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Socks
                  <input
                    type="color"
                    value={selectedTeam.kit.home.socks}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          home: { ...selectedTeam.kit.home, socks: event.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Pattern
                  <select
                    value={selectedTeam.kit.home.pattern}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          home: { ...selectedTeam.kit.home, pattern: event.target.value },
                        },
                      })
                    }
                  >
                    <option value="stripes">Stripes</option>
                    <option value="waves">Waves</option>
                    <option value="dots">Dots</option>
                    <option value="clean">Clean</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="kit-column">
              <h3>Away Kit</h3>
              <div className={`kit-preview ${selectedTeam.kit.away.pattern}`}>
                <div className="kit-figure">
                  <div className="kit-shirt" style={{ backgroundColor: selectedTeam.kit.away.shirt }}>
                    <span className="kit-collar" />
                    <span className="kit-sleeve left" />
                    <span className="kit-sleeve right" />
                  </div>
                  <div className="kit-shorts" style={{ backgroundColor: selectedTeam.kit.away.shorts }}>
                    <span className="kit-short-trim" />
                  </div>
                  <div className="kit-legs">
                    <div className="kit-sock" style={{ backgroundColor: selectedTeam.kit.away.socks }}>
                      <span className="kit-boot" />
                    </div>
                    <div className="kit-sock" style={{ backgroundColor: selectedTeam.kit.away.socks }}>
                      <span className="kit-boot" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="kit-controls">
                <label>
                  Shirt
                  <input
                    type="color"
                    value={selectedTeam.kit.away.shirt}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          away: { ...selectedTeam.kit.away, shirt: event.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Shorts
                  <input
                    type="color"
                    value={selectedTeam.kit.away.shorts}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          away: { ...selectedTeam.kit.away, shorts: event.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Socks
                  <input
                    type="color"
                    value={selectedTeam.kit.away.socks}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          away: { ...selectedTeam.kit.away, socks: event.target.value },
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Pattern
                  <select
                    value={selectedTeam.kit.away.pattern}
                    onChange={(event) =>
                      updateTeam(selectedTeam.id, {
                        kit: {
                          ...selectedTeam.kit,
                          away: { ...selectedTeam.kit.away, pattern: event.target.value },
                        },
                      })
                    }
                  >
                    <option value="stripes">Stripes</option>
                    <option value="waves">Waves</option>
                    <option value="dots">Dots</option>
                    <option value="clean">Clean</option>
                  </select>
                </label>
              </div>
            </div>
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
                    <div className="slot-card">
                      <img src={card.imageUrl} alt={card.name} />
                      <span>{card.name}</span>
                    </div>
                  ) : (
                    <div className="slot-empty">Drop card</div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="collection-filters">
            {["ALL", "GK", "DEF", "MID", "ATT"].map((filter) => (
              <button
                key={filter}
                className={teamFilter === filter ? "active" : ""}
                onClick={() => setTeamFilter(filter)}
              >
                {filter === "ALL" ? "All" : filter}
              </button>
            ))}
          </div>
          <div className="collection-grid compact">
            {state.inventory.cards
              .filter((card) => (teamFilter === "ALL" ? true : card.position === teamFilter))
              .map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  compact
                  countryFlags={state.countryFlags}
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
            <button onClick={runMatch}>Preview Match</button>
          </div>
          {selectedStadium && (
            <div className="stadium-meta">
              <span>Home bonus: +{selectedStadium.modifiers.homeAdvantage.toFixed(1)}</span>
              <span>Capacity bonus: +{selectedStadium.modifiers.capacityBonus.toFixed(1)}</span>
              <span>Weather: {selectedStadium.modifiers.weather ?? "sun"}</span>
            </div>
          )}

          {matchPhase === "preview" && pendingMatch && (
            <div className="match-preview">
              <div>
                <h3>Opponent Lineup</h3>
                <div className="lineup-list">
                  {pendingMatch.formationAway.slots.map((slot) => {
                    const lineupSlot = pendingMatch.awayTeam.lineup.find((item) => item.slotId === slot.positionKey);
                    const card = lineupSlot?.cardId ? cardsById[lineupSlot.cardId] : null;
                    return (
                      <div key={slot.positionKey} className="lineup-item">
                        <span>{slot.positionKey}</span>
                        <strong>{card?.name ?? "TBD"}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="preview-actions">
                <button onClick={startMatch}>Start Match</button>
              </div>
            </div>
          )}

          {(matchPhase === "playing" || matchPhase === "finished") && pendingMatch && (
            <div className="match-live">
              <div className={`match-pitch ${matchPhase}`}>
                <div className="goal goal-top" />
                <div className="goal goal-bottom" />
                <div
                  className="match-ball"
                  style={{ left: `${ballPos.x}%`, top: `${ballPos.y}%` }}
                />
                {pendingMatch.formationHome.slots.map((slot) => {
                  const lineupSlot = pendingMatch.homeTeam.lineup.find((item) => item.slotId === slot.positionKey);
                  const card = lineupSlot?.cardId ? cardsById[lineupSlot.cardId] : null;
                  const driftX = (liveMinute % 6) - 3;
                  const driftY = (liveMinute % 4) - 2;
                  return (
                    <div
                      key={slot.positionKey}
                      className="match-player home"
                      style={{
                        left: `${slot.x + driftX}%`,
                        top: `${slot.y + driftY}%`,
                        backgroundColor: pendingMatch.homeTeam.kit.home.shirt,
                        borderColor: pendingMatch.homeTeam.kit.home.shorts,
                      }}
                    >
                      <span>{card?.name ?? slot.positionKey}</span>
                    </div>
                  );
                })}
                {pendingMatch.formationAway.slots.map((slot) => {
                  const lineupSlot = pendingMatch.awayTeam.lineup.find((item) => item.slotId === slot.positionKey);
                  const card = lineupSlot?.cardId ? cardsById[lineupSlot.cardId] : null;
                  const driftX = ((liveMinute + 3) % 6) - 3;
                  const driftY = ((liveMinute + 2) % 4) - 2;
                  return (
                    <div
                      key={slot.positionKey}
                      className="match-player away"
                      style={{
                        left: `${slot.x + driftX}%`,
                        top: `${slot.y + driftY}%`,
                        backgroundColor: pendingMatch.opponentKit.shirt,
                        borderColor: pendingMatch.opponentKit.shorts,
                      }}
                    >
                      <span>{card?.name ?? slot.positionKey}</span>
                    </div>
                  );
                })}
              </div>

              <div className="match-events">
                <div className="match-score">
                  <strong>
                    {pendingMatch.homeTeam.name} {pendingMatch.match.score.home} - {pendingMatch.match.score.away}{" "}
                    {pendingMatch.awayTeam.name}
                  </strong>
                  <span>{liveMinute}'</span>
                </div>
                <div className="events-list">
                  {liveEvents.map((event, index) => (
                    <div key={`${event.minute}-${index}`} className={`event ${event.type}`}>
                      <span>{event.minute}'</span>
                      <p>{event.text}</p>
                    </div>
                  ))}
                </div>
                {matchPhase === "finished" && (
                  <div className="match-summary">
                    <p>{pendingMatch.match.summary}</p>
                    <p className="commentary">{pendingMatch.match.commentary}</p>
                    <strong>You earned {pendingMatch.reward} tokens.</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          {(matchPhase === "preview" || matchPhase === "playing") && (
            <div className="match-chat">
              <h3>Match Words</h3>
              <div className="chat-buttons">
                {["Snyggt", "Rematch?", "Du är bajs", "Jag kommer vinna", "Skit ner dig"].map((text) => (
                  <button key={text} onClick={() => sendTaunt(text)}>
                    {text}
                  </button>
                ))}
              </div>
              <div className="chat-log">
                {chatLog.map((entry, index) => (
                  <div key={`${entry.from}-${index}`} className={`chat-line ${entry.from}`}>
                    <span>{entry.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="match-history">
            {state.matchHistory.map((match) => (
              <div key={match.id} className="match-card">
                <strong>
                  {selectedTeam.name} {match.score.home} - {match.score.away} Robo Strikers
                </strong>
                <p>{match.summary}</p>
                {match.commentary && <p className="commentary">{match.commentary}</p>}
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
            <div className="shop-card hero-pack-card">
              <h3>Hero Pack</h3>
              <p>Only legendary Heroes (85-89 OVR).</p>
              <div className="price">{heroPackCostTokens} tokens</div>
              <button onClick={buyHeroPack}>Buy Hero Pack</button>
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
                      heroPacks: (state.inventory.heroPacks ?? 0) + 1,
                    },
                  })
                }
              >
                Grant 1 Hero Pack
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
                Leagues (fixed)
                <input value="Premier League, La Liga, Bundesliga, Ligue 1, Allsvenskan" disabled />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={state.settings.autoSeason}
                  onChange={(event) =>
                    updateState({
                      settings: {
                        ...state.settings,
                        autoSeason: event.target.checked,
                        season: event.target.checked ? latestSeasonYear() : state.settings.season,
                      },
                    })
                  }
                />
                Auto latest season
              </label>
              <label>
                Season
                <input
                  type="number"
                  value={state.settings.season}
                  disabled={state.settings.autoSeason}
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
