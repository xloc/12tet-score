import { scoreDuration, type Score } from './music';
import { scoreBars, type BarTiming } from './timing';

export type MatchMode = 'continue' | 'restart' | 'previous' | 'next' | 'jump';
export type FollowingReference = {
  bars: BarTiming[];
  events: { at: number; pitches: number[]; bar: number }[];
};
export type MatchEvidence = {
  pitch: number;
  at: number;
  kind: 'match' | 'extra';
  missed: number[];
};
export type MatchCandidate = {
  mode: MatchMode;
  bar: number;
  at: number;
  pitches: number[];
  matchedPitches: number[];
  cost: number;
  evidence: MatchEvidence[];
};
export type MatchResult = {
  decision:
    | 'following'
    | 'restarted'
    | 'advanced'
    | 'returned'
    | 'jumped'
    | 'ambiguous'
    | 'unmatched';
  reason: string;
  tick?: number;
  candidates: MatchCandidate[];
};

type Path = {
  index: number;
  matched: number[];
  mode: MatchMode;
  cost: number;
  evidence: MatchEvidence[];
};

// A bounded, pitch-only state graph. These costs express matching evidence,
// not calibrated probabilities or a grade for the player's accuracy.
const extraCost = 2.5;
const missedCost = 1;
export const moveMargin = 1.5;
export const minimumMatches = 2;
export const followingWindow = 12;
export const distantJumpPolicy = { matches: 6, onsets: 3, score: 0.85, lead: 0.15 };
const pathsPerMode = 16;
const modes: MatchMode[] = ['continue', 'restart', 'previous', 'next'];

export function isDistant(from: number, to: number) {
  return to < from - 2 || to > from + 1;
}

export function matchStats(candidate: MatchCandidate) {
  const matches = candidate.evidence.filter((item) => item.kind === 'match');
  const extra = candidate.evidence.length - matches.length;
  const missed = candidate.evidence.reduce((count, item) => count + item.missed.length, 0);
  const score = matches.length / (matches.length + extra + missed || 1);
  return {
    matches: matches.length,
    extra,
    missed,
    score,
    onsets: new Set(matches.map((item) => item.at)).size,
    support: score * Math.min(matches.length / distantJumpPolicy.matches, 1),
  };
}

export function compareMatches(a: MatchCandidate, b: MatchCandidate) {
  const left = matchStats(a);
  const right = matchStats(b);
  return right.support - left.support || right.matches - left.matches || a.cost - b.cost;
}

export class ScoreFollower {
  private bars;
  private events;
  private firstEvents: number[];
  private paths: Path[] = [];
  private bar = 0;

  constructor(score: Score, tick = 0) {
    this.bars = scoreBars(scoreDuration(score), score.ppq, score.meters, score.sections);
    const onsets = new Map<number, Set<number>>();
    for (const note of score.notes) {
      if (!onsets.has(note.at)) onsets.set(note.at, new Set());
      onsets.get(note.at)!.add(note.pitch);
    }
    this.firstEvents = this.bars.map(() => -1);
    let bar = 0;
    this.events = [...onsets]
      .sort(([a], [b]) => a - b)
      .map(([at, pitches], index) => {
        while (at >= this.bars[bar]!.to) bar++;
        if (this.firstEvents[bar] === -1) this.firstEvents[bar] = index;
        return { at, pitches: [...pitches].sort((a, b) => a - b), bar };
      });
    this.reset(tick);
  }

  reset(tick: number) {
    this.bar = this.bars.findIndex((bar) => tick >= bar.from && tick < bar.to);
    if (this.bar < 0) this.bar = this.bars.length - 1;
    let index = this.events.findIndex((event) => event.bar === this.bar && event.at >= tick);
    if (index < 0) index = this.events.findIndex((event) => event.bar === this.bar);
    this.paths = index < 0 ? [] : [this.start(index, 'continue', 0)];
  }

  get reference(): FollowingReference {
    return { bars: this.bars, events: this.events };
  }

  choose(candidate: MatchCandidate) {
    this.bar = candidate.bar - 1;
    this.paths = [
      {
        index: this.events.findIndex((event) => event.at === candidate.at),
        matched: [...candidate.matchedPitches],
        mode: 'continue',
        cost: 0,
        evidence: candidate.evidence,
      },
    ];
  }

  private start(index: number, mode: MatchMode, cost: number): Path {
    return { index, mode, cost, matched: [], evidence: [] };
  }

  receive(pitch: number): MatchResult {
    const expanded: Path[] = [];
    const first = this.firstEvents[this.bar] ?? -1;
    const next = this.firstEvents[this.bar + 1] ?? -1;
    const currentPaths = this.paths.filter((path) => this.events[path.index]!.bar === this.bar);
    const base = currentPaths.length ? Math.min(...currentPaths.map((path) => path.cost * 0.9)) : 0;

    const match = (path: Path, missed: number[] = []) => {
      const event = this.events[path.index]!;
      if (!event.pitches.includes(pitch) || path.matched.includes(pitch)) return;
      expanded.push({
        ...path,
        cost: path.cost + missed.length * missedCost,
        matched: [...path.matched, pitch].sort((a, b) => a - b),
        evidence: [
          ...path.evidence,
          { pitch, at: event.at, kind: 'match' as const, missed: [...missed] },
        ].slice(-followingWindow),
      });
    };

    for (const previous of this.paths) {
      const path = { ...previous, cost: previous.cost * 0.9 };
      const event = this.events[path.index]!;
      expanded.push({
        ...path,
        cost: path.cost + extraCost,
        evidence: [
          ...path.evidence,
          { pitch, at: event.at, kind: 'extra' as const, missed: [] },
        ].slice(-followingWindow),
      });
      match(path);

      // At most two omitted onsets per attack; never search distant bars.
      const missed = event.pitches.filter((note) => !path.matched.includes(note));
      for (let index = path.index + 1; index <= path.index + 3; index++) {
        const target = this.events[index];
        if (!target || target.bar > this.bar + 1) break;
        const enteringNext = target.bar > event.bar;
        match(
          {
            ...path,
            index,
            matched: [],
            mode:
              target.bar === this.bar + 1
                ? 'next'
                : target.bar < this.bar
                  ? 'previous'
                  : path.mode === 'previous'
                    ? 'continue'
                    : path.mode,
            cost: path.cost + (enteringNext ? 0.5 : 0),
          },
          missed,
        );
        missed.push(...target.pitches);
      }
    }

    // A retry abandons the unfinished suffix. It does not count it as missed.
    if (first >= 0) match(this.start(first, 'restart', base + 0.5));
    if (next >= 0) match(this.start(next, 'next', base + 1));
    for (let bar = Math.max(0, this.bar - 2); bar < this.bar; bar++) {
      const index = this.firstEvents[bar];
      if (index !== undefined && index >= 0) match(this.start(index, 'previous', base + 2.5));
    }

    const unique = new Map<string, Path>();
    for (const path of expanded.sort((a, b) => a.cost - b.cost)) {
      const key = `${path.mode}:${path.index}:${path.matched.join(',')}`;
      if (!unique.has(key)) unique.set(key, path);
    }
    this.paths = modes.flatMap((mode) =>
      [...unique.values()].filter((path) => path.mode === mode).slice(0, pathsPerMode),
    );
    const minimum = Math.min(...this.paths.map((path) => path.cost));
    for (const path of this.paths) path.cost -= minimum;

    const positions = new Map<string, Path>();
    for (const path of this.paths) {
      const key = `${path.mode}:${this.events[path.index]!.bar}`;
      if (!positions.has(key)) positions.set(key, path);
    }
    const winners = [...positions.values()].sort((a, b) => a.cost - b.cost);
    const candidates = winners.map((path): MatchCandidate => ({
      mode: path.mode,
      bar: this.bars[this.events[path.index]!.bar]!.number,
      at: this.events[path.index]!.at,
      pitches: this.events[path.index]!.pitches,
      matchedPitches: path.matched,
      cost: path.cost,
      evidence: path.evidence,
    }));
    const best = winners[0];
    const barNumber = this.bars[this.bar]?.number ?? 1;
    if (!best || best.evidence.at(-1)?.kind !== 'match') {
      return {
        decision: 'unmatched',
        reason: `Staying in bar ${barNumber}: the latest note does not support a clearer position.`,
        candidates,
      };
    }

    const target = this.events[best.index]!;
    const matches = best.evidence.filter((item) => item.kind === 'match').length;
    if (target.bar !== this.bar) {
      const other = winners.find((path) => this.events[path.index]!.bar !== target.bar);
      const margin = other ? other.cost - best.cost : Infinity;
      if (matches < minimumMatches || margin < moveMargin) {
        return {
          decision: 'ambiguous',
          reason: `Staying in bar ${barNumber}: more notes are needed to distinguish another bar from a retry.`,
          candidates,
        };
      }
      const backwards = target.bar < this.bar;
      this.bar = target.bar;
      this.paths = this.paths
        .filter((path) => this.events[path.index]!.bar === this.bar)
        .map((path) => ({ ...path, mode: 'continue' }));
      return {
        decision: backwards ? 'returned' : 'advanced',
        reason: `Moved to bar ${this.bars[this.bar]!.number}: the recent notes favor it over the current bar.`,
        tick: target.at,
        candidates,
      };
    }

    if (best.mode === 'restart' && matches < minimumMatches) {
      return {
        decision: 'ambiguous',
        reason: `Staying in bar ${barNumber}: one note could be a retry or an extra note.`,
        candidates,
      };
    }
    const alternative = winners.find((path) => this.events[path.index]!.bar !== this.bar);
    if (alternative && alternative.cost - best.cost < moveMargin) {
      return {
        decision: 'ambiguous',
        reason: `Staying in bar ${barNumber}: this bar and another both fit the recent notes.`,
        tick: target.at,
        candidates,
      };
    }
    return {
      decision: best.mode === 'restart' ? 'restarted' : 'following',
      reason:
        best.mode === 'restart'
          ? `Restart detected in bar ${barNumber}: the recent notes match its opening again.`
          : `Following bar ${barNumber}: the recent notes match this position.`,
      tick: target.at,
      candidates,
    };
  }
}
