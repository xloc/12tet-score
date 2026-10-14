import { scoreDuration, type Note, type Score } from './music';
import { scoreBars, type BarTiming } from './timing';
import { ornamentSteps } from './ornaments';

export type MatchMode = 'continue' | 'restart' | 'previous' | 'next' | 'jump';
export type FollowingReference = {
  bars: BarTiming[];
  events: {
    at: number;
    pitches: number[];
    bar: number;
    grace?: { notes: number[][]; main: number[]; before: boolean; until?: number }[];
  }[];
  inputWindow: number;
};
type GraceProgress = Record<number, { step: number; matched: number[] }[]>;
export type MatchEvidence = {
  pitch: number;
  at: number;
  kind: 'match' | 'extra' | 'grace';
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
  grace?: GraceProgress;
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

export type FollowingPath = {
  index: number;
  matched: number[];
  evidence: MatchEvidence[];
  grace?: GraceProgress;
};
type Path = FollowingPath & { mode: MatchMode; cost: number };

// A bounded, pitch-only state graph. These costs express matching evidence,
// not calibrated probabilities or a grade for the player's accuracy.
const extraCost = 2.5;
const missedCost = 1;
const barEntryCost = 0.5;
export const moveMargin = 1.5;
export const minimumMatches = 2;
export const followingWindow = 12;
export const distantJumpPolicy = { matches: 6, onsets: 3, score: 0.85, lead: 0.15 };
export const followingPaths = 16;
const modes: MatchMode[] = ['continue', 'restart', 'previous', 'next'];

export function isDistant(from: number, to: number) {
  return to < from - 2 || to > from + 1;
}

export function matchStats(candidate: MatchCandidate) {
  const matches = candidate.evidence.filter((item) => item.kind === 'match');
  const extra = candidate.evidence.filter((item) => item.kind === 'extra').length;
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

export function competesAt(candidate: MatchCandidate, at: number) {
  const latest = candidate.evidence.at(-1);
  return latest?.kind !== 'grace' || latest.at !== at;
}

export function followingKey(path: FollowingPath) {
  return `${path.index}:${path.matched.join(',')}:${JSON.stringify(path.grace ?? {})}`;
}

export function advanceGrace(
  reference: FollowingReference,
  grace: GraceProgress | undefined,
  index: number,
) {
  const event = reference.events[index]!;
  const retained = Object.fromEntries(
    Object.entries(grace ?? {}).filter(
      ([key]) =>
        Number(key) >= index ||
        reference.events[Number(key)]!.grace?.some(
          (sequence) => sequence.until !== undefined && event.at < sequence.until,
        ),
    ),
  );
  // A delayed figure remains available while the other hand moves ahead.
  if (event.grace?.some((sequence) => !sequence.before) && !retained[index])
    retained[index] = event.grace.map(() => ({ step: 0, matched: [] }));
  return Object.keys(retained).length ? retained : undefined;
}

export function appendEvidence(
  evidence: MatchEvidence[],
  item: MatchEvidence,
  inputWindow: number,
) {
  const recent = [...evidence, item].slice(-inputWindow);
  let count = 0;
  for (let index = recent.length - 1; index >= 0; index--) {
    if (recent[index]!.kind !== 'grace' && ++count > followingWindow)
      return recent.slice(index + 1);
  }
  return recent;
}

// Consume optional notes at this onset, leading into the next one, or finishing
// an earlier held note, without adding independent position evidence.
export function graceMatches<T extends FollowingPath>(
  reference: FollowingReference,
  path: T,
  pitch: number,
  lastIndex = path.index + 1,
): T[] {
  const matches: T[] = [];
  const indices = [
    ...Object.keys(path.grace ?? {})
      .map(Number)
      .filter((index) => index < path.index),
    ...Array.from({ length: lastIndex - path.index + 1 }, (_, offset) => path.index + offset),
  ];
  for (const index of indices) {
    const event = reference.events[index];
    if (!event?.grace) continue;
    for (const [voice, sequence] of event.grace.entries()) {
      if (
        index < path.index &&
        (sequence.until === undefined || reference.events[path.index]!.at >= sequence.until)
      )
        continue;
      const closed =
        sequence.before &&
        index === path.index &&
        sequence.main.every((note) => path.matched.includes(note));
      const progress = path.grace?.[index]?.[voice] ?? { step: 0, matched: [] };
      for (let step = progress.step; step < sequence.notes.length; step++) {
        if (!sequence.notes[step]!.includes(pitch)) continue;
        const played = step === progress.step ? progress.matched : [];
        if (played.includes(pitch)) continue;
        // An ornament can start on the main pitch. If its next quick note
        // arrives, reinterpret that first attack as the optional prefix.
        const initial =
          sequence.before &&
          index === path.index &&
          step > 0 &&
          progress.step === 0 &&
          !progress.matched.length
            ? sequence.main.filter(
                (note) => sequence.notes[0]!.includes(note) && path.matched.includes(note),
              )
            : [];
        if (closed && !initial.length) continue;
        const voices = event.grace.map(
          (_, voice) => path.grace?.[index]?.[voice] ?? { step: 0, matched: [] },
        );
        voices[voice] = { step, matched: [...played, pitch].sort((a, b) => a - b) };
        matches.push({
          ...path,
          matched: path.matched.filter((note) => !initial.includes(note)),
          grace: { ...path.grace, [index]: voices },
          evidence: appendEvidence(
            initial.length
              ? path.evidence.map((item) =>
                  item.kind === 'match' && item.at === event.at && initial.includes(item.pitch)
                    ? { ...item, kind: 'grace' as const }
                    : item,
                )
              : path.evidence,
            { pitch, at: event.at, kind: 'grace', missed: [] },
            reference.inputWindow,
          ),
        });
      }
    }
  }
  return matches;
}

export class ScoreFollower {
  private bars;
  private events;
  private firstEvents: number[];
  private paths: Path[] = [];
  private bar = 0;
  private inputWindow;

  constructor(score: Score, tick = 0) {
    this.bars = scoreBars(
      scoreDuration(score),
      score.ppq,
      score.meters,
      score.sections,
      score.pickup,
    );
    const onsets = new Map<number, Note[]>();
    for (const note of score.notes) {
      const at = note.at;
      if (!onsets.has(at)) onsets.set(at, []);
      onsets.get(at)!.push(note);
    }
    this.firstEvents = this.bars.map(() => -1);
    let bar = 0;
    this.events = [...onsets]
      .sort(([a], [b]) => a - b)
      .map(([at, notes], index): FollowingReference['events'][number] => {
        while (at >= this.bars[bar]!.to) bar++;
        if (this.firstEvents[bar] === -1) this.firstEvents[bar] = index;
        const grace = notes.flatMap((note) => {
          if (!note.ornament) return [];
          const before = note.ornament.timing !== 'beforeEnd';
          return [
            {
              notes: ornamentSteps(note.ornament).map((pitches) =>
                [...pitches].sort((a, b) => a - b),
              ),
              main: [note.pitch],
              before,
              ...(!before ? { until: note.at + note.len } : {}),
            },
          ];
        });
        return {
          at,
          pitches: [...new Set(notes.map((note) => note.pitch))].sort((a, b) => a - b),
          bar,
          ...(grace.length ? { grace } : {}),
        };
      });
    this.inputWindow =
      followingWindow *
      (1 +
        Math.max(
          0,
          ...this.events.map(
            (event) =>
              event.grace?.reduce(
                (total, sequence) =>
                  total + sequence.notes.reduce((total, notes) => total + notes.length, 0),
                0,
              ) ?? 0,
          ),
        ));
    this.reset(tick);
  }

  reset(tick: number) {
    tick = Math.max(0, tick);
    this.bar = this.bars.findIndex((bar) => tick >= bar.from && tick < bar.to);
    if (this.bar < 0) this.bar = this.bars.length - 1;
    let index = this.events.findIndex((event) => event.bar === this.bar && event.at >= tick);
    if (index < 0) index = this.events.findIndex((event) => event.bar === this.bar);
    this.paths = index < 0 ? [] : [this.start(index, 'continue', 0)];
  }

  get reference(): FollowingReference {
    return { bars: this.bars, events: this.events, inputWindow: this.inputWindow };
  }

  choose(candidate: MatchCandidate) {
    this.bar = this.bars.findIndex((bar) => bar.number === candidate.bar);
    this.paths = [
      {
        index: this.events.findIndex((event) => event.at === candidate.at),
        matched: [...candidate.matchedPitches],
        mode: 'continue',
        cost: 0,
        evidence: candidate.evidence,
        grace: candidate.grace,
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
        grace: advanceGrace(this.reference, path.grace, path.index),
        evidence: appendEvidence(
          path.evidence,
          { pitch, at: event.at, kind: 'match', missed: [...missed] },
          this.inputWindow,
        ),
      });
    };

    for (const previous of this.paths) {
      const path = { ...previous, cost: previous.cost * 0.9 };
      const event = this.events[path.index]!;
      expanded.push({
        ...path,
        cost: path.cost + extraCost,
        evidence: appendEvidence(
          path.evidence,
          { pitch, at: event.at, kind: 'extra', missed: [] },
          this.inputWindow,
        ),
      });
      match(path);
      expanded.push(
        ...graceMatches(
          this.reference,
          path,
          pitch,
          (this.events[path.index + 1]?.bar ?? Infinity) <= this.bar + 1
            ? path.index + 1
            : path.index,
        ),
      );

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
            cost: path.cost + (enteringNext ? barEntryCost : 0),
          },
          missed,
        );
        missed.push(...target.pitches);
      }
    }

    const seed = (index: number, mode: MatchMode, cost: number) => {
      const path = this.start(index, mode, cost);
      match(path);
      expanded.push(...graceMatches(this.reference, path, pitch, index));
    };
    // A retry abandons the unfinished suffix. It does not count it as missed.
    if (first >= 0) seed(first, 'restart', base + 0.5);
    if (next >= 0) seed(next, 'next', base + 1);
    for (let bar = Math.max(0, this.bar - 2); bar < this.bar; bar++) {
      const index = this.firstEvents[bar];
      if (index !== undefined && index >= 0) seed(index, 'previous', base + 2.5);
    }

    const unique = new Map<string, Path>();
    for (const path of expanded.sort(
      (a, b) =>
        a.cost - b.cost ||
        b.evidence.filter((item) => item.kind === 'match').length -
          a.evidence.filter((item) => item.kind === 'match').length,
    )) {
      const key = `${path.mode}:${followingKey(path)}`;
      if (!unique.has(key)) unique.set(key, path);
    }
    this.paths = modes.flatMap((mode) =>
      [...unique.values()].filter((path) => path.mode === mode).slice(0, followingPaths),
    );
    const minimum = Math.min(...this.paths.map((path) => path.cost));
    for (const path of this.paths) path.cost -= minimum;

    const positions = new Map<string, Path>();
    for (const path of this.paths) {
      const key = `${path.mode}:${this.events[path.index]!.bar}`;
      if (!positions.has(key)) positions.set(key, path);
    }
    const winners = [...positions.values()].sort((a, b) => a.cost - b.cost);
    let best = winners[0];
    if (best?.evidence.at(-1)?.kind === 'grace') {
      // A prefix for this same anchor cannot veto stronger main-note evidence
      // just because entering its bar carries the normal prior cost.
      const matches = best.evidence.filter((item) => item.kind === 'match').length;
      const main = winners.find(
        (path) =>
          path.evidence.at(-1)?.kind === 'match' &&
          this.events[path.index]!.at === best!.evidence.at(-1)!.at &&
          path.cost <= best!.cost + barEntryCost &&
          path.evidence.filter((item) => item.kind === 'match').length > matches,
      );
      if (main) {
        best = main;
        winners.splice(winners.indexOf(main), 1);
        winners.unshift(main);
      }
    }
    const candidates = winners.map((path): MatchCandidate => ({
      mode: path.mode,
      bar: this.bars[this.events[path.index]!.bar]!.number,
      at: this.events[path.index]!.at,
      pitches: this.events[path.index]!.pitches,
      matchedPitches: path.matched,
      cost: path.cost,
      evidence: path.evidence,
      ...(path.grace ? { grace: path.grace } : {}),
    }));
    const barNumber = this.bars[this.bar]?.number ?? 1;
    if (!best || best.evidence.at(-1)?.kind !== 'match') {
      return {
        decision: best?.evidence.at(-1)?.kind === 'grace' ? 'following' : 'unmatched',
        reason:
          best?.evidence.at(-1)?.kind === 'grace'
            ? `Quick notes fit this position in bar ${barNumber}; waiting for a main note.`
            : `Staying in bar ${barNumber}: the latest note does not support a clearer position.`,
        candidates,
      };
    }

    const target = this.events[best.index]!;
    const matches = best.evidence.filter((item) => item.kind === 'match').length;
    if (target.bar !== this.bar) {
      const other = candidates.find(
        (candidate) =>
          candidate.bar !== this.bars[target.bar]!.number && competesAt(candidate, target.at),
      );
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
    const alternative = candidates.find(
      (candidate) =>
        candidate.bar !== this.bars[this.bar]!.number && competesAt(candidate, target.at),
    );
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
