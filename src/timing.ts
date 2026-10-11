import { seconds, type Meter, type Section, type Tempo } from './music';

export type BarTiming = {
  from: number;
  to: number;
  number: number;
  meter: string;
  beatTicks: number;
};

export function scoreBars(
  totalTicks: number,
  ppq: number,
  meters: Meter[],
  sections: Section[] = [],
) {
  if (meters[0]?.at !== 0) throw new Error('The first meter must start at tick 0.');
  for (const [index, meter] of meters.entries()) {
    if (
      !/^\d+\/\d+$/.test(meter.meter) ||
      meter.meter.split('/').some((part) => Number(part) <= 0)
    ) {
      throw new Error(`Invalid meter: ${meter.meter}. Use a value such as 4/4.`);
    }
    if (!Number.isFinite(meter.at) || (index && meter.at <= meters[index - 1]!.at))
      throw new Error('Meters must be ordered by start time.');
  }
  const bars: BarTiming[] = [];
  let meterIndex = 0;
  for (let from = 0; from < totalTicks;) {
    if (meters[meterIndex + 1]?.at === from) meterIndex++;
    const meter = meters[meterIndex]!;
    const [numerator, denominator] = meter.meter.split('/').map(Number);
    const beatTicks = (ppq * 4) / denominator!;
    const next = from + numerator! * beatTicks;
    if (meters[meterIndex + 1] && meters[meterIndex + 1]!.at < next) {
      throw new Error('Meter changes must start at a bar boundary.');
    }
    bars.push({
      from,
      to: Math.min(next, totalTicks),
      number: bars.length + 1,
      meter: meter.meter,
      beatTicks,
    });
    from = next;
  }
  if (sections.some((section) => !bars.some((bar) => bar.from === section.at))) {
    throw new Error('Sections must start at a bar boundary.');
  }
  return bars;
}

export function validateTempos(tempos: Tempo[]) {
  if (tempos[0]?.at !== 0) throw new Error('The first tempo must start at tick 0.');
  for (const [index, tempo] of tempos.entries()) {
    if (!Number.isFinite(tempo.bpm) || tempo.bpm <= 0)
      throw new Error('Tempo must be a positive BPM value.');
    if (!Number.isFinite(tempo.at) || (index && tempo.at <= tempos[index - 1]!.at))
      throw new Error('Tempos must be ordered by start time.');
  }
}

export function tempoAt(tempos: Tempo[], tick: number) {
  return tempos.filter((tempo) => tempo.at <= tick).at(-1)!;
}

export function secondsAt(tick: number, tempos: Tempo[], ppq: number, speed = 1) {
  let elapsed = 0;
  for (const [index, tempo] of tempos.entries()) {
    if (tempo.at >= tick) break;
    const end = Math.min(tick, tempos[index + 1]?.at ?? tick);
    elapsed += seconds(end - tempo.at, tempo.bpm * speed, ppq);
  }
  return elapsed;
}

export function tickAtSeconds(elapsed: number, tempos: Tempo[], ppq: number, speed = 1) {
  for (const [index, tempo] of tempos.entries()) {
    const next = tempos[index + 1];
    const duration = next ? seconds(next.at - tempo.at, tempo.bpm * speed, ppq) : Infinity;
    if (elapsed < duration) return tempo.at + (Math.max(0, elapsed) * tempo.bpm * speed * ppq) / 60;
    elapsed -= duration;
  }
  return 0;
}
