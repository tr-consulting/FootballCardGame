import PropTypes from "prop-types";

const flagUrl = (country) => {
  if (!country) return "";
  return `https://countryflagsapi.com/png/${encodeURIComponent(country)}`;
};

const statKeys = ["pace", "shooting", "passing", "defense", "physical"];

export default function Card({ card, onDragStart, compact = false }) {
  return (
    <div
      className={`player-card ${compact ? "compact" : ""}`}
      draggable={Boolean(onDragStart)}
      onDragStart={(event) => onDragStart?.(event, card)}
    >
      <div className="card-header">
        <div className="overall">{card.overall}</div>
        <div className="position">{card.position}</div>
      </div>
      <div className="card-image">
        <img src={card.imageUrl} alt={card.name} loading="lazy" />
      </div>
      <div className="card-body">
        <div className="card-name">{card.name}</div>
        <div className="card-meta">
          <span className="club">
            {card.clubLogo && <img src={card.clubLogo} alt={card.club} />}
            {card.club}
          </span>
          <span>{card.league}</span>
        </div>
        <div className="card-flags">
          {card.country && <img src={flagUrl(card.country)} alt={card.country} />}
          {card.country && <span>{card.country}</span>}
        </div>
        <div className="card-stats">
          {statKeys.map((key) => (
            <div key={key}>
              <span>{key.slice(0, 3).toUpperCase()}</span>
              <strong>{card.stats[key]}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Card.propTypes = {
  card: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    position: PropTypes.string.isRequired,
    imageUrl: PropTypes.string,
    country: PropTypes.string,
    club: PropTypes.string.isRequired,
    clubLogo: PropTypes.string,
    league: PropTypes.string.isRequired,
    overall: PropTypes.number.isRequired,
    stats: PropTypes.object.isRequired,
  }).isRequired,
  onDragStart: PropTypes.func,
  compact: PropTypes.bool,
};
