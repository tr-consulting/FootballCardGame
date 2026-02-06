export const todayISO = () => new Date().toISOString().slice(0, 10);

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const seededRandom = (seed) => {
  let t = seed + 0x6d2b79f5;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffle = (array, rand = Math.random) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const pickRandom = (array, count, rand = Math.random) => {
  if (array.length <= count) return [...array];
  return shuffle(array, rand).slice(0, count);
};

export const formatNumber = (value) => new Intl.NumberFormat().format(value);
