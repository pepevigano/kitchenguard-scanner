// MHD aus erkanntem Text lesen (Wegwerf-Test zu konzept/04_eingabemethoden.md, Weg „MHD per Foto oder Live-Texterkennung“).
// Reine Logik ohne Browser und Netzwerk, damit sie mit `node --test` geprüft werden kann.

const MONTH_WORDS = {
  JAN: 1, FEB: 2, MAR: 3, MAER: 3, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7,
  AUG: 8, SEP: 9, SEPT: 9, OKT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12,
};
const MONTH_RE = "(JAN|FEB|MAR|MAER|APR|MAI|MAY|JUN|JUL|AUG|SEPT|SEP|OKT|OCT|NOV|DEZ|DEC)";
const SEP = "[.\\-/]";
const DAY = "(0?[1-9]|[12]\\d|3[01])";
const MONTH_NUM = "(0?[1-9]|1[0-2])";

const RE_DMY_NUM = new RegExp(`(^|\\D)${DAY}\\s*${SEP}\\s*${MONTH_NUM}\\s*${SEP}\\s*(\\d{4}|\\d{2})(?!\\d)`, "g");
const RE_DMY_WORD = new RegExp(`(^|\\D)${DAY}\\s*[.\\-/ ]?\\s*${MONTH_RE}[A-Z]*\\.?\\s*[.\\-/ ]?\\s*(\\d{4}|\\d{2})(?!\\d)`, "g");
const RE_MY_NUM = new RegExp(`(^|\\D)${MONTH_NUM}\\s*${SEP}\\s*(\\d{4})(?!\\d)`, "g");
const RE_MY_WORD = new RegExp(`(^|\\D)${MONTH_RE}[A-Z]*\\.?\\s*[.\\-/ ]?\\s*(\\d{4})(?!\\d)`, "g");

const RE_USE_BY = /VERBRAUCH|USE\s*BY|A\s*CONSOMMER/g;
const RE_BEST_BEFORE = /HALTBAR|HALTB|MINDEST|\bMHD\b|\bBBE\b|BEST\s*BEFORE/g;

// Texterkennung verwechselt in Ziffernfolgen gern O mit 0 und I, l, | mit 1.
function fixDigits(text) {
  return text.replace(/[0-9OoIl|]{1,4}(?:[.\-/][0-9OoIl|]{1,4}){1,2}/g, (m) =>
    /\d/.test(m) ? m.replace(/[Oo]/g, "0").replace(/[Il|]/g, "1") : m,
  );
}

function normalize(text) {
  return fixDigits(String(text ?? ""))
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/[ \t]+/g, " ");
}

const pad2 = (n) => String(n).padStart(2, "0");
const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const fullYear = (y) => (y < 100 ? 2000 + y : y);

function lastIndexOfRe(re, text) {
  let last = -1;
  for (const m of text.matchAll(re)) last = m.index;
  return last;
}

// Steht davor „zu verbrauchen bis“ oder „mindestens haltbar bis“? Das nähere Stichwort gewinnt.
function detectKind(text, start) {
  const context = text.slice(Math.max(0, start - 70), start);
  const useBy = lastIndexOfRe(RE_USE_BY, context);
  const bestBefore = lastIndexOfRe(RE_BEST_BEFORE, context);
  if (useBy < 0 && bestBefore < 0) return "unbekannt";
  return useBy > bestBefore ? "verbrauch" : "mhd";
}

function hasEnde(text, start) {
  return /ENDE\s*[:.]?\s*$/.test(text.slice(Math.max(0, start - 12), start));
}

function* matches(re, text) {
  for (const m of text.matchAll(re)) {
    const prefix = m[1].length;
    yield { m, start: m.index + prefix, end: m.index + m[0].length };
  }
}

export function formatMhd(c) {
  return c.precision === "tag" ? `${pad2(c.day)}.${pad2(c.month)}.${c.year}` : `${pad2(c.month)}/${c.year}`;
}

// Liefert alle gefundenen Daten und das wahrscheinlichste. Nichts davon ist eine Gewissheit:
// Der Aufruf muss das Ergebnis dem Nutzer zur Bestätigung vorlegen.
export function parseMhd(text, now = new Date()) {
  const t = normalize(text);
  const found = [];
  const taken = []; // Bereiche vollständiger Datumsangaben, damit „10.2026“ nicht noch einmal aus „12.10.2026“ entsteht

  const overlaps = (start, end) => taken.some(([s, e]) => start < e && end > s);

  const add = (start, end, day, month, year, raw) => {
    if (month < 1 || month > 12) return;
    if (day !== null && day > daysInMonth(year, month)) return;
    const precision = day === null ? "monat" : "tag";
    found.push({
      raw: raw.trim(),
      start,
      day,
      month,
      year,
      precision,
      ende: precision === "monat" && hasEnde(t, start),
      kind: detectKind(t, start),
    });
  };

  for (const { m, start, end } of matches(RE_DMY_NUM, t)) {
    taken.push([start, end]);
    add(start, end, Number(m[2]), Number(m[3]), fullYear(Number(m[4])), m[0].slice(m[1].length));
  }
  for (const { m, start, end } of matches(RE_DMY_WORD, t)) {
    if (overlaps(start, end)) continue;
    taken.push([start, end]);
    add(start, end, Number(m[2]), MONTH_WORDS[m[3]], fullYear(Number(m[4])), m[0].slice(m[1].length));
  }
  for (const { m, start, end } of matches(RE_MY_NUM, t)) {
    if (overlaps(start, end)) continue;
    add(start, end, null, Number(m[2]), Number(m[3]), m[0].slice(m[1].length));
  }
  for (const { m, start, end } of matches(RE_MY_WORD, t)) {
    if (overlaps(start, end)) continue;
    add(start, end, null, MONTH_WORDS[m[2]], Number(m[3]), m[0].slice(m[1].length));
  }

  const earliest = new Date(Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate()));
  const latest = new Date(Date.UTC(now.getUTCFullYear() + 12, now.getUTCMonth(), now.getUTCDate()));

  const seen = new Set();
  const candidates = [];
  for (const c of found.sort((a, b) => a.start - b.start)) {
    const lastDay = c.day ?? daysInMonth(c.year, c.month);
    const until = new Date(Date.UTC(c.year, c.month - 1, lastDay));
    const iso = c.precision === "tag" ? `${c.year}-${pad2(c.month)}-${pad2(c.day)}` : `${c.year}-${pad2(c.month)}`;
    const key = `${iso}|${c.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({
      ...c,
      iso,
      isoLatest: `${c.year}-${pad2(c.month)}-${pad2(lastDay)}`,
      plausible: until >= earliest && until <= latest,
    });
  }

  // Bester Treffer: ein Datum mit Stichwort, sonst das späteste (Herstell- und Druckdaten liegen früher als das MHD).
  const plausible = candidates.filter((c) => c.plausible);
  const known = plausible.filter((c) => c.kind !== "unbekannt");
  const pool = known.length ? known : plausible;
  const best = pool.length ? pool.reduce((a, b) => (b.isoLatest > a.isoLatest ? b : a)) : null;

  return { candidates, best };
}
