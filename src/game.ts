import { ANSWERS, type SlangWord } from './words.ts';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

// Strayaword #1 = 6 September 2026.
const EPOCH = Date.UTC(2026, 8, 6);
const DAY_MS = 86_400_000;

export type LetterState = 'correct' | 'present' | 'absent' | 'empty';

export function puzzleNumberFor(date = new Date()): number {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((local - EPOCH) / DAY_MS) + 1);
}

// Mulberry32 — tiny deterministic PRNG.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], seed: number): T[] {
  const arr = items.slice();
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// A hand-picked opening run so the first fortnight is all instantly recognisable.
const OPENERS = [
  'BOGAN', 'SERVO', 'DUNNY', 'CHOOK', 'SANGA', 'BONZA', 'DAGGY',
  'TINNY', 'GALAH', 'CUPPA', 'SNAGS', 'CROOK', 'BEAUT', 'YAKKA',
];

const byWord = (w: string): SlangWord =>
  ANSWERS.find((a) => a.word === w) ?? ANSWERS[0];

export function wordForPuzzle(n: number): SlangWord {
  if (n >= 1 && n <= OPENERS.length) return byWord(OPENERS[n - 1]);

  const k = n - OPENERS.length - 1; // 0-based position after the opening run
  const rest = ANSWERS.filter((a) => !OPENERS.includes(a.word));

  // First pass: the remaining words, shuffled, with no repeats.
  if (k < rest.length) return shuffled(rest, 1000)[k];

  // After every word has appeared once, cycle the full list on a new shuffle each time.
  const k2 = k - rest.length;
  const len = ANSWERS.length;
  const cycle = Math.floor(k2 / len);
  return shuffled(ANSWERS, 2000 + cycle)[k2 % len];
}

/** Standard Wordle scoring with correct duplicate-letter handling. */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const res: LetterState[] = Array(WORD_LENGTH).fill('absent');
  const counts: Record<string, number> = {};
  for (const ch of answer) counts[ch] = (counts[ch] || 0) + 1;

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) {
      res[i] = 'correct';
      counts[guess[i]]--;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (res[i] === 'correct') continue;
    if (counts[guess[i]] > 0) {
      res[i] = 'present';
      counts[guess[i]]--;
    }
  }
  return res;
}

export function keyboardStates(
  guesses: string[],
  answer: string,
): Record<string, LetterState> {
  const map: Record<string, LetterState> = {};
  const rank: Record<LetterState, number> = { absent: 1, present: 2, correct: 3, empty: 0 };
  for (const g of guesses) {
    const s = scoreGuess(g, answer);
    for (let i = 0; i < WORD_LENGTH; i++) {
      const cur = map[g[i]];
      if (!cur || rank[s[i]] > rank[cur]) map[g[i]] = s[i];
    }
  }
  return map;
}

export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  dist: number[]; // index 0..5 = guesses to win; length 6
  lastPuzzle: number | null;
}

export interface DayState {
  puzzle: number;
  guesses: string[];
  status: 'playing' | 'won' | 'lost';
}

const STATS_KEY = 'strayaword.stats';
const DAY_KEY = 'strayaword.day';

export function loadStats(): Stats {
  const fresh: Stats = { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastPuzzle: null };
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw);
    return { ...fresh, ...p, dist: Array.isArray(p.dist) && p.dist.length === 6 ? p.dist : fresh.dist };
  } catch {
    return fresh;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadDay(puzzle: number): DayState {
  try {
    const raw = localStorage.getItem(DAY_KEY);
    if (raw) {
      const p = JSON.parse(raw) as DayState;
      if (p.puzzle === puzzle) return p;
    }
  } catch {
    /* ignore */
  }
  return { puzzle, guesses: [], status: 'playing' };
}

export function saveDay(state: DayState) {
  save(DAY_KEY, state);
}

/** Record a finished game into cumulative stats (idempotent per puzzle). */
export function recordResult(puzzle: number, won: boolean, guessCount: number): Stats {
  const stats = loadStats();
  if (stats.lastPuzzle === puzzle) return stats;

  stats.played += 1;
  const continues = stats.lastPuzzle === puzzle - 1;
  if (won) {
    stats.wins += 1;
    stats.currentStreak = continues ? stats.currentStreak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    if (guessCount >= 1 && guessCount <= 6) stats.dist[guessCount - 1] += 1;
  } else {
    stats.currentStreak = 0;
  }
  stats.lastPuzzle = puzzle;
  save(STATS_KEY, stats);
  return stats;
}

const EMOJI: Record<LetterState, string> = {
  correct: '🟩',
  present: '🟨',
  absent: '⬜',
  empty: '⬜',
};

export function shareText(puzzle: number, guesses: string[], answer: string, won: boolean): string {
  const grid = guesses
    .map((g) => scoreGuess(g, answer).map((s) => EMOJI[s]).join(''))
    .join('\n');
  const score = won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  return `Strayaword #${puzzle} ${score} 🇦🇺\n\n${grid}\n\nstrayaword.correia95.workers.dev`;
}

export function msUntilNextPuzzle(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime();
}
