export function getColorsFromBadge(badge: string, name: string): { primaryColor: string, secondaryColor: string } {
  const emojiMap: Record<string, string> = {
    '🔴': '#E63946', '⚪': '#F1FAEE', '🔵': '#1D3557', '⚫': '#111111',
    '🟡': '#F4A261', '🟢': '#2A9D8F', '🟠': '#E76F51', '🟣': '#9D4EDD',
    '🩵': '#A8DADC', '🍬': '#1D3557', '🐝': '#E76F51', '🌳': '#E63946',
    '😇': '#E63946', '🦊': '#1D3557', '🚜': '#1D3557', '🦓': '#111111',
    '🐺': '#8D99AE', '🦅': '#A8DADC', '⚜️': '#9D4EDD', '🐂': '#8D99AE',
    '💊': '#111111', '🐎': '#111111', '☠️': '#111111', '🗼': '#1D3557',
    '🐶': '#E63946', '🦁': '#1D3557', '🕊️': '#A8DADC', '🍒': '#E63946',
    '⚒️': '#9D4EDD', '😈': '#E63946', '🐓': '#F1FAEE'
  };

  const colors = [];
  for (const char of badge) {
    if (emojiMap[char]) colors.push(emojiMap[char]);
  }
  for (const char of Array.from(badge)) {
     if (emojiMap[char] && !colors.includes(emojiMap[char])) colors.push(emojiMap[char]);
  }

  if (colors.length >= 2) return { primaryColor: colors[0], secondaryColor: colors[1] };
  if (colors.length === 1) return { primaryColor: colors[0], secondaryColor: '#FFFFFF' };

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const primaryColor = '#' + Math.abs(hash).toString(16).padEnd(6, '0').slice(0, 6);
  const secondaryColor = '#' + Math.abs(~hash).toString(16).padEnd(6, '0').slice(0, 6);

  return { primaryColor, secondaryColor };
}
