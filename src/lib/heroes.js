import { clamp } from "./utils";
import { computeOverall } from "./ratings";

export const heroPackCostTokens = 3000;

const HERO_POOL = [
  { name: "Jean-Pierre Papin", position: "ATT", overall: 89 },
  { name: "Lúcio", position: "DEF", overall: 89 },
  { name: "Rudi Völler", position: "ATT", overall: 89 },
  { name: "Jürgen Kohler", position: "DEF", overall: 89 },
  { name: "Fernando Morientes", position: "ATT", overall: 89 },
  { name: "Célia Šašić", position: "ATT", overall: 89 },
  { name: "Abedi Pelé", position: "MID", overall: 89 },
  { name: "Gianluca Vialli", position: "ATT", overall: 89 },
  { name: "David Ginola", position: "MID", overall: 89 },
  { name: "Carlos Tévez", position: "ATT", overall: 88 },
  { name: "Javier Mascherano", position: "DEF", overall: 88 },
  { name: "Jay-Jay Okocha", position: "MID", overall: 88 },
  { name: "Rafael Márquez", position: "DEF", overall: 88 },
  { name: "Jari Litmanen", position: "MID", overall: 88 },
  { name: "Paulo Futre", position: "ATT", overall: 88 },
  { name: "Bixente Lizarazu", position: "DEF", overall: 88 },
  { name: "Diego Forlán", position: "ATT", overall: 88 },
  { name: "Ricardo Carvalho", position: "DEF", overall: 88 },
  { name: "Diego Milito", position: "ATT", overall: 88 },
  { name: "Mario Gómez", position: "ATT", overall: 88 },
  { name: "Vincent Kompany", position: "DEF", overall: 88 },
  { name: "Enzo Francescoli", position: "MID", overall: 88 },
  { name: "Wesley Sneijder", position: "MID", overall: 88 },
  { name: "Maicon", position: "DEF", overall: 88 },
  { name: "Nadine Keßler", position: "MID", overall: 88 },
  { name: "Antonio Di Natale", position: "ATT", overall: 88 },
  { name: "Eden Hazard", position: "MID", overall: 88 },
  { name: "Yaya Touré", position: "MID", overall: 88 },
  { name: "Jaap Stam", position: "DEF", overall: 87 },
  { name: "Iván Córdoba", position: "DEF", overall: 87 },
  { name: "Zé Roberto", position: "MID", overall: 87 },
  { name: "Tomas Brolin", position: "ATT", overall: 87 },
  { name: "Steve McManaman", position: "MID", overall: 87 },
  { name: "Jorge Campos", position: "GK", overall: 87 },
  { name: "Laura Georges", position: "DEF", overall: 87 },
  { name: "Marek Hamšík", position: "MID", overall: 87 },
  { name: "Claudio Marchisio", position: "MID", overall: 87 },
  { name: "Harry Kewell", position: "ATT", overall: 87 },
  { name: "Dimitar Berbatov", position: "ATT", overall: 87 },
  { name: "Rui Costa", position: "MID", overall: 87 },
  { name: "Joe Cole", position: "MID", overall: 87 },
  { name: "Hidetoshi Nakata", position: "MID", overall: 87 },
  { name: "Landon Donovan", position: "MID", overall: 86 },
  { name: "Włodzimierz Smolarek", position: "ATT", overall: 86 },
  { name: "Robbie Keane", position: "ATT", overall: 86 },
  { name: "Jerzy Dudek", position: "GK", overall: 86 },
  { name: "Ole Gunnar Solskjær", position: "ATT", overall: 86 },
  { name: "Fredrik Ljungberg", position: "MID", overall: 86 },
  { name: "Tomáš Rosický", position: "MID", overall: 86 },
  { name: "Sonia Bompastor", position: "DEF", overall: 86 },
  { name: "John Arne Riise", position: "DEF", overall: 86 },
  { name: "Ludovic Giuly", position: "MID", overall: 86 },
  { name: "Jamie Carragher", position: "DEF", overall: 86 },
  { name: "Sami al-Jaber", position: "ATT", overall: 86 },
  { name: "Park Ji-sung", position: "MID", overall: 86 },
  { name: "Guti", position: "MID", overall: 86 },
  { name: "Ramires", position: "MID", overall: 86 },
  { name: "Kanu", position: "ATT", overall: 86 },
  { name: "Blaise Matuidi", position: "MID", overall: 86 },
  { name: "Joan Capdevila", position: "DEF", overall: 86 },
  { name: "Dirk Kuyt", position: "MID", overall: 86 },
  { name: "Sidney Govou", position: "ATT", overall: 86 },
  { name: "Fara Williams", position: "MID", overall: 86 },
  { name: "Mohammed Noor", position: "MID", overall: 85 },
  { name: "Victor Ibarbo", position: "ATT", overall: 85 },
  { name: "Clint Dempsey", position: "MID", overall: 85 },
  { name: "DaMarcus Beasley", position: "MID", overall: 85 },
  { name: "Gervinho", position: "ATT", overall: 85 },
  { name: "Tim Howard", position: "GK", overall: 85 },
  { name: "Peter Crouch", position: "ATT", overall: 85 },
  { name: "Saeed al-Owairan", position: "ATT", overall: 85 },
  { name: "Seydou Doumbia", position: "ATT", overall: 85 },
  { name: "Alex Scott", position: "DEF", overall: 85 },
];

const buildHeroStats = (overall, position) => {
  const base = clamp(overall, 70, 99);
  const spread = Math.max(4, 100 - base);
  const adjust = () => clamp(base + Math.floor(Math.random() * 6) - 3, 70, 99);

  const templates = {
    GK: { pace: 55, shooting: 35, passing: 60, defense: 88, physical: 84 },
    DEF: { pace: 72, shooting: 55, passing: 68, defense: 88, physical: 86 },
    MID: { pace: 78, shooting: 76, passing: 86, defense: 70, physical: 78 },
    ATT: { pace: 86, shooting: 88, passing: 72, defense: 56, physical: 80 },
  };

  const template = templates[position] ?? templates.MID;
  const stats = {
    pace: clamp(template.pace + (base - 85) + Math.floor(Math.random() * spread / 10), 70, 99),
    shooting: clamp(template.shooting + (base - 85) + Math.floor(Math.random() * spread / 10), 70, 99),
    passing: clamp(template.passing + (base - 85) + Math.floor(Math.random() * spread / 10), 70, 99),
    defense: clamp(template.defense + (base - 85) + Math.floor(Math.random() * spread / 10), 70, 99),
    physical: clamp(template.physical + (base - 85) + Math.floor(Math.random() * spread / 10), 70, 99),
  };

  return { ...stats, overall: computeOverall(stats, position) };
};

export const buildHeroCards = (count = 12) => {
  const shuffled = [...HERO_POOL].sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map((hero, index) => {
    const stats = buildHeroStats(hero.overall, hero.position);
    return {
      id: `hero-${hero.name.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}-${index}`,
      playerId: 900000 + index,
      name: hero.name,
      position: hero.position,
      club: "Hero Club",
      clubLogo: "/hero-badge.svg",
      league: "Heroes",
      country: "",
      countryFlag: "",
      imageUrl: "/hero-silhouette.svg",
      stats: {
        pace: stats.pace,
        shooting: stats.shooting,
        passing: stats.passing,
        defense: stats.defense,
        physical: stats.physical,
      },
      overall: hero.overall,
    };
  });
};
