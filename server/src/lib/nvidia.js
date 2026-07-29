export const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_DEFAULT_MODEL = 'meta/llama-3.1-70b-instruct';

export async function nvidiaChatCompletion({ apiKey, baseUrl, model, messages, maxTokens = 600 }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      top_p: 0.9,
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NVIDIA API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
