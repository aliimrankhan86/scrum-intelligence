export const GROQ_PROVIDER = {
  id: 'groq',
  label: 'Groq',
  chipLabel: 'Groq 70B',
  modelId: 'llama-3.3-70b-versatile',
  accent: '#f59e0b',
};

export const OPENROUTER_PROVIDER = {
  id: 'openrouter',
  label: 'OpenRouter',
  chipLabel: 'OpenRouter',
  defaultModelId: 'google/gemma-4-31b-it:free',
  accent: '#60a5fa',
};

export const CEREBRAS_PROVIDER = {
  id: 'cerebras',
  label: 'Cerebras',
  chipLabel: 'Cerebras Llama 3.1 8B',
  modelId: 'llama3.1-8b',
  accent: '#4ade80',
};

export const AI_PROVIDER_ORDER = [
  GROQ_PROVIDER.id,
  OPENROUTER_PROVIDER.id,
  CEREBRAS_PROVIDER.id,
];

export function resolveOpenRouterModelId(value) {
  const text = value == null ? '' : String(value).trim();
  return text || OPENROUTER_PROVIDER.defaultModelId;
}
