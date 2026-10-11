import { chordLabel, type Annotation, type Pedal, type Score } from './music';
import { barPosition } from './layout';

export type DisplayAnnotation = Annotation & {
  kind: 'text' | 'chord' | 'pedal' | 'timing';
  timing?: string;
  pedal?: Pedal['type'];
};

export function scoreAnnotations(score: Score): DisplayAnnotation[] {
  const chords: DisplayAnnotation[] = score.chords.map((chord) => ({
    at: chord.at,
    len: chord.len,
    text: chordLabel(chord),
    kind: 'chord',
  }));
  const explanations: DisplayAnnotation[] = [
    ...score.annotations.map((item) => ({ ...item, kind: 'text' as const })),
    ...score.pitchGuides
      .filter((guide) => guide.text)
      .map((guide) => ({ at: guide.at, len: guide.len, text: guide.text!, kind: 'text' as const })),
  ];
  const meters = score.meters.filter(
    (meter, index) => index > 0 && meter.meter !== score.meters[index - 1]!.meter,
  );
  const tempos = score.tempos.filter(
    (tempo, index) => index > 0 && tempo.bpm !== score.tempos[index - 1]!.bpm,
  );
  const timing: DisplayAnnotation[] = [];
  for (const at of [...new Set([...meters, ...tempos].map((item) => item.at))].sort(
    (a, b) => a - b,
  )) {
    const meter = meters.find((meter) => meter.at === at);
    const tempo = tempos.find((tempo) => tempo.at === at);
    const text = [meter?.meter, tempo ? `${tempo.bpm} BPM` : ''].filter(Boolean).join(' · ');
    const caption = chords.find((item) => item.at === at);
    if (caption) caption.timing = text;
    else timing.push({ at, text, kind: 'timing' });
  }
  return [
    ...chords,
    ...timing,
    ...explanations,
    ...score.pedals.map((pedal) => ({
      at: pedal.at,
      len: pedal.len,
      text:
        pedal.type === 'sustain'
          ? (pedal.text ?? '')
          : `${{ sostenuto: 'Sostenuto pedal', soft: 'Soft pedal' }[pedal.type]}${pedal.text ? `: ${pedal.text}` : ''}`,
      kind: 'pedal' as const,
      pedal: pedal.type,
    })),
  ];
}

export function annotationPlacements(
  items: DisplayAnnotation[],
  from: number,
  to: number,
  bars: { from: number; to: number; left: number; right: number }[],
  textWidth: (item: DisplayAnnotation, continued: boolean) => number,
) {
  const origin = bars[0]!.left;
  const width = bars.at(-1)!.right - origin;
  const position = (tick: number) => {
    const bar = bars.find((bar) => tick < bar.to) ?? bars.at(-1)!;
    return bar.left - origin + barPosition(tick, bar) * (bar.right - bar.left);
  };
  const occupied: {
    item: DisplayAnnotation;
    left: number;
    right: number;
    captionRight: number;
  }[][] = [];
  return items
    .filter((item) =>
      item.len ? item.at < to && item.at + item.len > from : item.at >= from && item.at < to,
    )
    .map((item) => {
      const spanLeft = position(Math.max(from, item.at));
      const spanRight = item.len ? position(Math.min(to, item.at + item.len)) : spanLeft;
      const captionWidth = textWidth(item, item.at < from);
      const left =
        item.kind === 'timing' ? Math.max(0, Math.min(spanLeft, width - captionWidth)) : spanLeft;
      const boxWidth = item.len ? spanRight - spanLeft : Math.min(width - left, captionWidth);
      const right = left + boxWidth;
      let row = occupied.findIndex((lane) =>
        lane.every(
          (other) =>
            right <= other.left ||
            left >= other.right ||
            (item.kind === 'timing' &&
              other.item.kind === 'chord' &&
              left >= other.captionRight + 8 &&
              right <= other.right - 8),
        ),
      );
      if (row === -1) {
        row = occupied.length;
        occupied.push([]);
      }
      occupied[row]!.push({
        item,
        left,
        right,
        captionRight: left + Math.min(boxWidth, captionWidth),
      });
      return {
        item,
        row: row + 1,
        left,
        width: boxWidth,
        spanWidth: spanRight - spanLeft,
        continuesBefore: item.at < from,
        continuesAfter: !!item.len && item.at + item.len > to,
      };
    });
}
