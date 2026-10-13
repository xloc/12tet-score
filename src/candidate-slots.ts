export function candidateSlots(previous: (number | undefined)[], rankedBars: number[]) {
  const bars = [...new Set(rankedBars)].slice(0, previous.length);
  const slots = previous.map((bar) => (bar !== undefined && bars.includes(bar) ? bar : undefined));
  const additions = bars.filter((bar) => !slots.includes(bar));
  return slots.map((bar) => bar ?? additions.shift());
}
