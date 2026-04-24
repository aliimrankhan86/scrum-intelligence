export const AI_ROUTER_PROVIDER = {
  id: 'ai-router',
  label: 'AI Router',
  chipLabel: 'AI',
  accent: '#60a5fa',
};

export const AI_MODEL_CHAIN = [
  {
    key: 'groq',
    provider: 'groq',
    keyField: 'groqKey',
    id: 'llama-3.3-70b-versatile',
    label: 'Groq Llama 3.3 70B',
    accent: '#34d399',
  },
  {
    key: 'cohere',
    provider: 'cohere',
    keyField: 'cohereKey',
    id: 'command-r7b-12-2024',
    label: 'Cohere Command R7B',
    accent: '#f59e0b',
    endpoint: 'https://api.cohere.com/v2/chat',
  },
  {
    key: 'gemini',
    provider: 'gemini',
    keyField: 'geminiKey',
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    accent: '#60a5fa',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  },
  {
    key: 'openrouter',
    provider: 'openrouter',
    keyField: 'openrouterKey',
    id: 'openrouter/free',
    label: 'OpenRouter Free Router',
    accent: '#a78bfa',
    optional: true,
  },
];

export const AI_MODEL_ORDER = AI_MODEL_CHAIN.map((model) => model.key);

export function hasAIModelKey(model, keys = {}) {
  return Boolean(model?.keyField && String(keys[model.keyField] || '').trim());
}

export function hasAnyAIKey(keys = {}) {
  return AI_MODEL_CHAIN.some((model) => hasAIModelKey(model, keys));
}

export function getConfiguredAIModels(keys = {}) {
  return AI_MODEL_CHAIN.filter((model) => hasAIModelKey(model, keys));
}

export function getPreferredAIProvider(keys = {}) {
  const model = getConfiguredAIModels(keys)[0];
  return model?.provider || 'none';
}

export function getAIModel(key) {
  return AI_MODEL_CHAIN.find((model) => model.key === key) || null;
}

// Backward-compatible aliases for older imports and saved handoff notes.
export const OPENROUTER_PROVIDER = AI_ROUTER_PROVIDER;
export const OPENROUTER_MODEL_CHAIN = AI_MODEL_CHAIN;
export const OPENROUTER_MODEL_ORDER = AI_MODEL_ORDER;
export const getOpenRouterModel = getAIModel;
