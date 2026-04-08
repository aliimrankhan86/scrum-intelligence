import { cleanPrompt } from './cleanPrompt';

export function interpolatePrompt(sections = []) {
  const blocks = (Array.isArray(sections) ? sections : [sections])
    .flat(Infinity)
    .map((section) => String(section ?? '').trim())
    .filter(Boolean);

  return cleanPrompt(blocks.join('\n\n'));
}
