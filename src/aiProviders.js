export const OPENROUTER_PROVIDER = {
  id: 'openrouter',
  label: 'OpenRouter',
  chipLabel: 'OpenRouter',
  accent: '#60a5fa',
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
};

export const OPENROUTER_MODEL_CHAIN = [
  {
    key: 'primary',
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B',
    accent: '#60a5fa',
  },
  {
    key: 'fallback',
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B',
    accent: '#f59e0b',
  },
  {
    key: 'emergency',
    id: 'qwen/qwen3-coder:free',
    label: 'Qwen 3 Coder',
    accent: '#34d399',
  },
  {
    key: 'safety',
    id: 'openrouter/free',
    label: 'Free Router',
    accent: '#a78bfa',
  },
];

export const OPENROUTER_MODEL_ORDER = OPENROUTER_MODEL_CHAIN.map((model) => model.key);

export function getOpenRouterModel(key) {
  return OPENROUTER_MODEL_CHAIN.find((model) => model.key === key) || null;
}
