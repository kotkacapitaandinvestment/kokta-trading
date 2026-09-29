// The Kotka pairs (synthetic markets) people can pick, fetched once per visit.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { confirmDialog, toast } from '../../lib/dialogs';

let cache = null;
let inflight = null;

export function usePairs() {
  const [pairs, setPairs] = useState(cache);
  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    inflight ??= api.get('/game/pairs').then((r) => {
      cache = r.pairs;
      return cache;
    });
    inflight.then((p) => alive && setPairs(p)).catch(() => {
      inflight = null;
    });
    return () => {
      alive = false;
    };
  }, []);
  return pairs;
}

// A free practice match, on one pair or (without a symbol) a random one.
export async function startPractice(navigate, symbol = null) {
  const r = await api.post('/game/matches', { mode: 'practice', ...(symbol ? { symbol } : {}) });
  navigate(`/app/game/matches/${r.match.id}`);
}

// The chart's pair picker. In practice, picking another pair ends this
// practice (no stake) and starts a new one on it; a competition stays on the
// pair it was created with.
export function usePairSwitch(m) {
  const navigate = useNavigate();
  const pairs = usePairs();
  const practice = m.mode === 'practice';
  const running = ['READY', 'LOCKED', 'COUNTDOWN', 'ACTIVE'].includes(m.status);
  const pick = async (symbol) => {
    try {
      if (running) {
        if (!(await confirmDialog({ title: `Practise on ${symbol} instead?`, message: 'This practice match ends now and a new one starts on the pair you picked. Practice has no stake, so nothing is lost.', confirmLabel: `Switch to ${symbol}` }))) return;
        await api.post(`/game/matches/${m.id}/cancel`);
      }
      await startPractice(navigate, symbol);
    } catch (err) {
      toast(err.message, { tone: 'error' });
    }
  };
  return {
    pairs,
    onPickPair: practice ? pick : null,
    pairNote: practice ? 'Pick another pair to start a new practice match on it.' : `This match is on ${m.pair?.symbol}, and both players trade the same market. You choose the pair when you create a challenge.`,
  };
}
