import { cleanPrompt } from './cleanPrompt';

export async function copyToClipboard(text) {
  try {
    if (!navigator?.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(cleanPrompt(text));
    return true;
  } catch {
    return false;
  }
}
