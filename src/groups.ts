import type { NoteGroup } from './music';

const voiceColors = ['#2563eb', '#f97316', '#0d9488', '#9333ea', '#e11d48', '#0891b2'];

export function groupAppearance(ids: string[], groups: NoteGroup[]) {
  const hand = groups.find((group) => group.kind === 'hand' && ids.includes(group.id));
  const voices = groups.filter((group) => group.kind === 'voice');
  const voiceIndex = voices.findIndex((group) => ids.includes(group.id));
  const color = voiceIndex === -1 ? '#334155' : voiceColors[voiceIndex % voiceColors.length];
  return {
    color,
    backgroundColor: color,
    backgroundImage:
      hand?.kind === 'hand' && hand.hand === 'right'
        ? 'repeating-linear-gradient(45deg, transparent 0 11px, rgb(255 255 255 / 0.65) 11px 12px)'
        : undefined,
  };
}
