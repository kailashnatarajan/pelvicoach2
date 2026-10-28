import { NormalizedSession } from './sessionSchema';
import * as SF from './signalFeedback';

/**
 * Shared bridge between the Case Generator & Replay tab and the
 * Biofeedback & Simulator tab, so both can run at the same time.
 */
export interface ReplayState {
  session: NormalizedSession | null;
  summary: SF.SessionSummary | null;
  config: SF.FeedbackConfig;
  pos: number;
  playing: boolean;
  floor: number;
}

let state: ReplayState = {
  session: null,
  summary: null,
  config: { ...SF.DEFAULTS },
  pos: 0,
  playing: false,
  floor: 0,
};

type Listener = (s: ReplayState) => void;
const listeners = new Set<Listener>();

export const ReplayBridge = {
  get(): ReplayState {
    return state;
  },
  set(next: Partial<ReplayState>) {
    const sessionChanged = next.session !== undefined && next.session !== state.session;
    state = { ...state, ...next };
    if (sessionChanged && state.session) {
      const sorted = Float64Array.from(state.session.envelope).sort();
      state.floor = sorted[Math.floor(0.05 * sorted.length)] || 0;
    }
    listeners.forEach((l) => l(state));
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  ready(): boolean {
    return !!state.session && !!state.summary;
  },
  /** Current replay sample expressed in the simulator's feature format. */
  feature() {
    const { session: s, summary: sum, config, pos, floor } = state;
    if (!s || !sum) return null;
    const i = SF.indexAt(s, pos);
    const pk = sum.envelopePeak;
    const fb = SF.feedbackAt(s, pos, config, sum.refLevel);
    const nrm = Math.max(0, Math.min(1.3, pk > floor ? (s.envelope[i] - floor) / (pk - floor) : 0));
    let pf = 4 + 96 * nrm;
    if (fb.quality === 'flat') pf = 0.4;
    return {
      pf,
      pct: Math.round(Math.min(100, nrm * 100)),
      mr: fb.quality === 'line_interference' ? 0.6 : 0.03,
    };
  },
};
