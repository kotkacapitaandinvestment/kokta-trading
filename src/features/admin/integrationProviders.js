import { Sparkles, CreditCard } from 'lucide-react';

export const INTEGRATION_PROVIDERS = [
  {
    id: 'nvidia',
    name: 'NVIDIA',
    category: 'Artificial Intelligence',
    icon: Sparkles,
    description: 'NVIDIA NIM / build.nvidia.com — powers live Kotka AI chat completions.',
    fallbackNote: 'When disabled or unconfigured, Kotka AI automatically falls back to its scripted mentor responses.',
    fields: [
      { key: 'secret', label: 'API Key', type: 'password', placeholder: 'nvapi-…' },
      {
        key: 'config.model',
        label: 'Model',
        type: 'text',
        placeholder: 'meta/llama-3.1-70b-instruct',
        hint: 'e.g. meta/llama-3.1-70b-instruct, nvidia/llama-3.1-nemotron-70b-instruct',
        default: 'meta/llama-3.1-70b-instruct',
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
];
