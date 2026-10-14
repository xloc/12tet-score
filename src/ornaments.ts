import { pitchLabel, type Note, type Ornament, type PlayedNote, type Score } from './music';

export function ornamentSteps(ornament: Ornament) {
  return ornament.pitches.map((step) => (Array.isArray(step) ? step : [step]));
}

// Score notes remain untouched. Every sounding event retains its actual owner.
export function performedNotes(score: Pick<Score, 'notes' | 'groups' | 'ppq'>): PlayedNote[] {
  if (score.notes.some((note) => 'grace' in note || 'anchor' in note))
    throw new Error(
      'This score uses flat grace events. Store each sequence in its main note’s ornament field.',
    );
  const main: PlayedNote[] = score.notes.map(({ ornament: _ornament, ...note }, index) => ({
    ...note,
    source: score.notes[index]!,
  }));
  const quick: PlayedNote[][] = main.map(() => []);
  const voices = new Set(
    score.groups.filter((group) => group.kind === 'voice').map((group) => group.id),
  );

  function fail(note: Note, reason: string): never {
    throw new Error(`Ornament on ${pitchLabel(note.pitch)} at tick ${note.at}: ${reason}`);
  }

  function expand(index: number) {
    const principal = main[index]!;
    const note = principal.source;
    const ornament = note.ornament!;
    if (!['beforeStart', 'atStart', 'beforeEnd'].includes(ornament.timing))
      fail(note, 'choose beforeStart, atStart, or beforeEnd.');
    const steps = ornamentSteps(ornament);
    if (
      !steps.length ||
      steps.some(
        (step) =>
          !step.length ||
          step.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127),
      )
    )
      fail(note, 'each step needs one or more MIDI pitches between 0 and 127.');
    const weights = ornament.rhythm ?? steps.map(() => 1);
    if (
      weights.length !== steps.length ||
      weights.some((weight) => !Number.isFinite(weight) || weight <= 0)
    )
      fail(note, 'rhythm must contain one positive weight per step.');
    if (!Number.isInteger(note.len) || note.len <= 0)
      fail(note, 'the main note needs a positive integer length.');
    if (ornament.len !== undefined && (!Number.isInteger(ornament.len) || ornament.len <= 0))
      fail(note, 'len must be a positive integer number of ticks.');

    const automatic = ornament.len === undefined;
    let length = ornament.len ?? Math.round((steps.length * score.ppq) / 16);
    let at = note.at;
    let donors: PlayedNote[] = [];
    if (ornament.timing === 'beforeStart') {
      const voiceIds = note.groups.filter((id) => voices.has(id));
      const ids = voiceIds.length ? voiceIds : note.groups;
      const sameVoice = (other: Note) =>
        ids.length ? ids.every((id) => other.groups.includes(id)) : !other.groups.length;
      const prior = main.filter((other) => other.source.at < note.at && sameVoice(other.source));
      const priorQuick = quick
        .flat()
        .filter((other) => other.source.at < note.at && sameVoice(other.source));
      const previousAt = Math.max(-Infinity, ...prior.map((other) => other.source.at));
      const previous = prior.filter((other) => other.source.at === previousAt);
      const end = Math.max(0, ...[...prior, ...priorQuick].map((other) => other.at + other.len));
      const gap = Math.max(0, note.at - end);
      // A hand can stand in for a voice only when its predecessor is unambiguous.
      const unambiguous = previous.length === 1 || (previous.length > 1 && voiceIds.length > 0);
      const tailStart = Math.max(
        0,
        ...previous.map((other) => other.at),
        ...prior.filter((other) => !previous.includes(other)).map((other) => other.at + other.len),
        ...priorQuick.map((other) => other.at + other.len),
      );
      const tail = unambiguous && end <= note.at ? Math.max(0, end - tailStart) : 0;
      const available =
        note.at === 0 ? Infinity : gap + (automatic ? Math.floor(tail / 2) : Math.max(0, tail - 1));
      if (automatic) length = Math.min(length, available);
      if (length > available || length <= 0)
        fail(
          note,
          `requested ${length} ticks, but only ${available} are available before it; check len and voice groups.`,
        );
      at = note.at - length;
      donors = previous.filter((other) => other.at + other.len > at);
    } else {
      if (automatic) length = Math.min(length, Math.floor(note.len / 2));
      if (length >= note.len || length <= 0)
        fail(
          note,
          `requested ${length} ticks within a ${note.len}-tick note; leave a positive main-note duration.`,
        );
      if (ornament.timing === 'beforeEnd') at += note.len - length;
    }

    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let elapsedWeight = 0;
    let boundary = 0;
    quick[index] = steps.flatMap((pitches, step) => {
      elapsedWeight += weights[step]!;
      const end = step === steps.length - 1 ? length : Math.round((elapsedWeight / total) * length);
      const len = end - boundary;
      if (len <= 0)
        fail(note, 'not enough tick resolution for every step; increase PPQ or the group length.');
      const events = pitches.map((pitch): PlayedNote => ({
        pitch,
        at: at + boundary,
        len,
        groups: note.groups,
        grace: true,
        source: note,
      }));
      boundary = end;
      return events;
    });
    if (ornament.timing === 'beforeStart') {
      for (const donor of donors) donor.len = at - donor.at;
    } else {
      principal.len -= length;
      if (ornament.timing === 'atStart') principal.at += length;
    }
  }

  for (const [index, note] of score.notes.entries())
    if (note.ornament && note.ornament.timing !== 'beforeStart') expand(index);
  for (const { index } of score.notes
    .map((note, index) => ({ note, index }))
    .filter(({ note }) => note.ornament?.timing === 'beforeStart')
    .sort((a, b) => a.note.at - b.note.at))
    expand(index);

  return main.flatMap((note, index) =>
    note.source.ornament?.timing === 'beforeEnd'
      ? [note, ...quick[index]!]
      : [...quick[index]!, note],
  );
}
