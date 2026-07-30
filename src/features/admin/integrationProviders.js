import { Sparkles, CreditCard, Globe2 } from 'lucide-react';

export const INTEGRATION_PROVIDERS = [
  {
    id: 'nvidia',
    name: 'NVIDIA',
    category: 'Artificial Intelligence',
    icon: Sparkles,
    description: 'NVIDIA NIM / build.nvidia.com — powers live Kotka AI chat completions and chart image analysis.',
    fallbackNote: 'When disabled or unconfigured, Kotka AI automatically falls back to its scripted mentor responses. Without a vision model configured, uploaded chart images are rejected with a clear message instead of being sent to a text-only model.',
    fields: [
      { key: 'secret', label: 'API Key', type: 'password', placeholder: 'nvapi-…' },
      {
        key: 'config.model',
        label: 'Chat Model',
        type: 'text',
        placeholder: 'meta/llama-3.1-70b-instruct',
        hint: 'e.g. meta/llama-3.1-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct',
        default: 'meta/llama-3.1-70b-instruct',
      },
      {
        key: 'config.visionModel',
        label: 'Vision Model',
        type: 'text',
        placeholder: 'meta/llama-3.2-90b-vision-instruct',
        hint: 'Used when a trader uploads a chart image. Must be a vision-capable NIM model — confirmed working: meta/llama-3.2-90b-vision-instruct, meta/llama-3.2-11b-vision-instruct.',
        default: 'meta/llama-3.2-90b-vision-instruct',
      },
      {
        key: 'config.baseUrl',
        label: 'Base URL',
        type: 'text',
        default: 'https://integrate.api.nvidia.com/v1',
      },
    ],
  },
  {
    id: 'paystack',
    name: 'Paystack',
    category: 'Payments',
    icon: CreditCard,
    description: 'Processes Pro and Institutional subscription billing.',
    fallbackNote: 'Without an active Paystack connection, upgrade and billing actions are disabled platform-wide.',
    fields: [
      { key: 'secret', label: 'Secret Key', type: 'password', placeholder: 'sk_test_… or sk_live_…' },
      { key: 'publicKey', label: 'Public Key', type: 'text', placeholder: 'pk_test_… or pk_live_…' },
    ],
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    category: 'Market Data',
    icon: Globe2,
    description: 'Real watchlist quotes and the economic calendar shown on the Dashboard and Market Intelligence.',
    fallbackNote: 'Without an active Finnhub connection, Watchlist, Economic Events, and Sentiment show illustrative sample data instead of live figures.',
    fields: [{ key: 'secret', label: 'API Key', type: 'password', placeholder: 'Finnhub API key' }],
  },
  {
    id: 'massive',
    name: 'Massive',
    category: 'Market Data',
    icon: Globe2,
    description: 'Formerly Polygon.io — forex, metals, indices, and crypto data powering the Watchlist and Market Intelligence volatility (ATR).',
    fallbackNote: 'Without an active Massive connection, symbols and volatility figures it would otherwise cover fall back to sample data.',
    fields: [{ key: 'secret', label: 'API Key', type: 'password', placeholder: 'Massive API key' }],
  },
];
