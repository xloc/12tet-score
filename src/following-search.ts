import {
  compareMatches,
  distantJumpPolicy,
  followingWindow,
  isDistant,
  minimumMatches,
  matchStats,
  type FollowingReference,
  type MatchCandidate,
  type MatchEvidence,
} from './following';

export function automaticLocation(
  candidates: MatchCandidate[],
  bar: number,
  allowDistant: boolean,
) {
  const sorted = [...candidates].sort(compareMatches);
  const best = sorted[0];
  if (!best || best.bar === bar || best.evidence.at(-1)?.kind !== 'match') return;
  const distant = isDistant(bar, best.bar);
  if (distant && !allowDistant) return;
  const stats = matchStats(best);
  const other = sorted.find((candidate) => candidate.bar !== best.bar);
  const lead = stats.support - (other ? matchStats(other).support : 0);
  const policy = distant
    ? distantJumpPolicy
    : {
        matches: minimumMatches,
        onsets: 2,
        score: distantJumpPolicy.score,
        lead: distantJumpPolicy.lead,
      };
  if (
    stats.matches >= policy.matches &&
    stats.onsets >= policy.onsets &&
    stats.score >= policy.score &&
    lead >= policy.lead
  )
    return best;
}

export type SearchRequest =
  | { type: 'init'; generation: number; reference: FollowingReference }
  | { type: 'search'; generation: number; id: number; pitches: number[] };
export type SearchResponse = { generation: number; id: number; candidates: MatchCandidate[] };

type SearchPath = {
  index: number;
  matched: number[];
  evidence: MatchEvidence[];
};

export class FollowingSearch {
  private byPitch = new Map<number, number[]>();

  constructor(private reference: FollowingReference) {
    for (const [index, event] of reference.events.entries()) {
      for (const pitch of event.pitches) {
        if (!this.byPitch.has(pitch)) this.byPitch.set(pitch, []);
        this.byPitch.get(pitch)!.push(index);
      }
    }
  }

  // Each yield bounds a worker task. A new input window cancels an older search.
  *search(pitches: number[]): Generator<void, MatchCandidate[]> {
    let paths: SearchPath[] = [];
    let work = 0;
    const candidate = (path: SearchPath): MatchCandidate => ({
      mode: 'jump',
      bar: this.reference.bars[this.reference.events[path.index]!.bar]!.number,
      at: this.reference.events[path.index]!.at,
      pitches: this.reference.events[path.index]!.pitches,
      matchedPitches: path.matched,
      cost: path.evidence.reduce(
        (cost, item) => cost + item.missed.length + (item.kind === 'extra' ? 2.5 : 0),
        0,
      ),
      evidence: path.evidence,
    });

    for (const pitch of pitches.slice(-followingWindow)) {
      const expanded = new Map<number, SearchPath[]>();
      const add = (path: SearchPath) => {
        const existing = expanded.get(path.index) ?? [];
        const same = existing.findIndex(
          (item) => item.matched.join(',') === path.matched.join(','),
        );
        if (same >= 0) {
          if (compareMatches(candidate(path), candidate(existing[same]!)) >= 0) return;
          existing.splice(same, 1);
        }
        existing.push(path);
        existing.sort((a, b) => compareMatches(candidate(a), candidate(b)));
        expanded.set(path.index, existing.slice(0, 2));
      };
      const match = (path: SearchPath, missed: number[] = []) => {
        const event = this.reference.events[path.index]!;
        if (!event.pitches.includes(pitch) || path.matched.includes(pitch)) return;
        add({
          ...path,
          matched: [...path.matched, pitch].sort((a, b) => a - b),
          evidence: [
            ...path.evidence,
            { pitch, at: event.at, kind: 'match' as const, missed: [...missed] },
          ].slice(-followingWindow),
        });
      };

      for (const path of paths) {
        const event = this.reference.events[path.index]!;
        add({
          ...path,
          evidence: [
            ...path.evidence,
            { pitch, at: event.at, kind: 'extra' as const, missed: [] },
          ].slice(-followingWindow),
        });
        match(path);
        const missed = event.pitches.filter((note) => !path.matched.includes(note));
        for (let index = path.index + 1; index <= path.index + 3; index++) {
          const target = this.reference.events[index];
          if (!target) break;
          match({ ...path, index, matched: [] }, missed);
          missed.push(...target.pitches);
        }
        if (++work % 128 === 0) yield;
      }
      for (const index of this.byPitch.get(pitch) ?? []) {
        match({ index, matched: [], evidence: [] });
        if (++work % 128 === 0) yield;
      }
      paths = [...expanded.values()].flat();
    }

    const best = new Map<number, MatchCandidate>();
    for (const path of paths) {
      const item = candidate(path);
      const previous = best.get(item.bar);
      if (matchStats(item).matches >= 2 && (!previous || compareMatches(item, previous) < 0))
        best.set(item.bar, item);
      if (++work % 128 === 0) yield;
    }
    return [...best.values()].sort(compareMatches).slice(0, 12);
  }
}
