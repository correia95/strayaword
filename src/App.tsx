import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type DayState,
  MAX_GUESSES,
  type Stats,
  WORD_LENGTH,
  keyboardStates,
  loadDay,
  loadStats,
  msUntilNextPuzzle,
  puzzleNumberFor,
  recordResult,
  saveDay,
  scoreGuess,
  shareText,
  wordForPuzzle,
} from './game.ts';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function Countdown() {
  const [ms, setMs] = useState(msUntilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return <span className="mono">{pad(h)}:{pad(m)}:{pad(s)}</span>;
}

export default function App() {
  const puzzle = useMemo(() => puzzleNumberFor(), []);
  const entry = useMemo(() => wordForPuzzle(puzzle), [puzzle]);
  const answer = entry.word;

  const [day, setDay] = useState<DayState>(() => loadDay(puzzle));
  const [current, setCurrent] = useState('');
  const currentRef = useRef('');
  currentRef.current = current;
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [modal, setModal] = useState<null | 'help' | 'stats'>(null);
  const [toast, setToast] = useState('');
  const [shared, setShared] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const finished = day.status !== 'playing';

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 1600);
  }, []);

  // First-visit help; ensure a resumed finished game is recorded in stats.
  useEffect(() => {
    try {
      if (!localStorage.getItem('strayaword.seen')) {
        setModal('help');
        localStorage.setItem('strayaword.seen', '1');
      }
    } catch {
      /* ignore */
    }
    if (day.status !== 'playing') {
      setStats(recordResult(puzzle, day.status === 'won', day.guesses.length));
    }
  }, []); // run once on mount

  const submit = useCallback(() => {
    if (finished) return;
    const attempt = currentRef.current;
    if (attempt.length !== WORD_LENGTH) {
      flash('Not enough letters');
      return;
    }
    const guesses = [...day.guesses, attempt];
    let status: DayState['status'] = 'playing';
    if (attempt === answer) status = 'won';
    else if (guesses.length >= MAX_GUESSES) status = 'lost';

    const next: DayState = { puzzle, guesses, status };
    setDay(next);
    saveDay(next);
    setCurrent('');

    if (status !== 'playing') {
      setStats(recordResult(puzzle, status === 'won', guesses.length));
      window.setTimeout(() => setModal('stats'), 1400);
    }
  }, [answer, day.guesses, finished, flash, puzzle]);

  const press = useCallback(
    (key: string) => {
      if (finished) return;
      if (key === 'ENTER') return submit();
      if (key === 'BACK') return setCurrent((c) => c.slice(0, -1));
      if (/^[A-Z]$/.test(key)) setCurrent((c) => (c.length < WORD_LENGTH ? c + key : c));
    },
    [finished, submit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) return;
      if (e.key === 'Enter') press('ENTER');
      else if (e.key === 'Backspace') press('BACK');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, modal]);

  const kb = useMemo(() => keyboardStates(day.guesses, answer), [day.guesses, answer]);

  const doShare = async () => {
    const text = shareText(puzzle, day.guesses, answer, day.status === 'won');
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setShared(true);
        flash('Copied results to clipboard');
      }
    } catch {
      /* cancelled */
    }
  };

  const rows = Array.from({ length: MAX_GUESSES }, (_, r) => {
    if (r < day.guesses.length) {
      const g = day.guesses[r];
      const s = scoreGuess(g, answer);
      return { letters: g.split(''), states: s, filled: true };
    }
    if (r === day.guesses.length && !finished) {
      return {
        letters: Array.from({ length: WORD_LENGTH }, (_, i) => current[i] ?? ''),
        states: Array(WORD_LENGTH).fill('empty') as ('empty')[],
        filled: false,
      };
    }
    return { letters: Array(WORD_LENGTH).fill(''), states: Array(WORD_LENGTH).fill('empty') as ('empty')[], filled: false };
  });

  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...stats.dist);

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon" aria-label="How to play" onClick={() => setModal('help')}>?</button>
        <h1>Strayaword</h1>
        <button className="icon" aria-label="Statistics" onClick={() => setModal('stats')}>▢</button>
      </header>
      <p className="sub">The daily Aussie slang word game · #{puzzle}</p>

      <main className="board" aria-label="Guess grid">
        {rows.map((row, r) => (
          <div className="row" key={r}>
            {row.letters.map((ch, i) => (
              <div
                key={i}
                className={`tile ${row.states[i]} ${ch && !row.filled ? 'typed' : ''}`}
                aria-label={ch ? `${ch} ${row.filled ? row.states[i] : ''}` : 'empty'}
              >
                {ch}
              </div>
            ))}
          </div>
        ))}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}

      {finished && (
        <section className="result" aria-live="polite">
          <p className="result-line">
            {day.status === 'won' ? 'Ripper! ' : 'Bad luck — '}
            the word was <strong>{answer}</strong>
          </p>
          <p className="result-meaning">{entry.meaning}</p>
          <p className="result-example">{entry.example}</p>
          <div className="result-actions">
            <button className="primary" onClick={doShare}>{shared ? 'Copied ✓' : 'Share result'}</button>
            <span className="next">Next word in <Countdown /></span>
          </div>
        </section>
      )}

      <div className="keyboard" aria-hidden={finished}>
        {ROWS.map((line, li) => (
          <div className="krow" key={li}>
            {li === 2 && <button className="key wide" onClick={() => press('ENTER')}>Enter</button>}
            {line.split('').map((ch) => (
              <button key={ch} className={`key ${kb[ch] ?? ''}`} onClick={() => press(ch)}>
                {ch}
              </button>
            ))}
            {li === 2 && <button className="key wide" onClick={() => press('BACK')} aria-label="Backspace">⌫</button>}
          </div>
        ))}
      </div>

      <section className="seo-cta">
        <a href="#glossary">Aussie slang dictionary ↓</a>
      </section>

      {modal === 'help' && (
        <Modal onClose={() => setModal(null)} title="How to play">
          <p>Guess the <strong>5-letter Aussie slang word</strong> in six tries.</p>
          <ul>
            <li>Each guess must be five letters — hit Enter to submit.</li>
            <li>Tiles change colour to show how close you were:</li>
          </ul>
          <div className="legend">
            <div className="row"><div className="tile correct">B</div><div className="tile empty">O</div><div className="tile empty">G</div><div className="tile empty">A</div><div className="tile empty">N</div></div>
            <p><strong>B</strong> is in the word and in the right spot.</p>
            <div className="row"><div className="tile empty">C</div><div className="tile present">H</div><div className="tile empty">O</div><div className="tile empty">O</div><div className="tile empty">K</div></div>
            <p><strong>H</strong> is in the word but in the wrong spot.</p>
            <div className="row"><div className="tile empty">S</div><div className="tile empty">E</div><div className="tile absent">R</div><div className="tile empty">V</div><div className="tile empty">O</div></div>
            <p><strong>R</strong> isn’t in the word.</p>
          </div>
          <p>A new word drops every day at midnight. Every answer is real Australian slang — check the <a href="#glossary" onClick={() => setModal(null)}>slang dictionary</a> below.</p>
        </Modal>
      )}

      {modal === 'stats' && (
        <Modal onClose={() => setModal(null)} title="Statistics">
          <div className="stat-grid">
            <div><strong>{stats.played}</strong><span>Played</span></div>
            <div><strong>{winPct}</strong><span>Win %</span></div>
            <div><strong>{stats.currentStreak}</strong><span>Streak</span></div>
            <div><strong>{stats.maxStreak}</strong><span>Max streak</span></div>
          </div>
          <h3>Guess distribution</h3>
          <div className="dist">
            {stats.dist.map((n, i) => {
              const isLast = day.status === 'won' && day.guesses.length === i + 1;
              return (
                <div className="dist-row" key={i}>
                  <span className="dist-label">{i + 1}</span>
                  <span
                    className={`dist-bar ${isLast ? 'hi' : ''}`}
                    style={{ width: `${Math.max(8, (n / maxDist) * 100)}%` }}
                  >
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
          {finished && (
            <div className="result-actions center">
              <span className="next">Next word in <Countdown /></span>
              <button className="primary" onClick={doShare}>{shared ? 'Copied ✓' : 'Share'}</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
