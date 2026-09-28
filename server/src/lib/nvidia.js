import { noteModelCall } from './usage/context.js';

export const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVIDIA_DEFAULT_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

// Some hosted models fix sampling parameters (e.g. top_p must stay at its
// default); pass topP: null to omit it.
export async function nvidiaChatCompletion({ apiKey, baseUrl, model, messages, maxTokens = 600, temperature = 0.5, topP = 0.9, timeoutMs, extraBody = {} }) {
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
      temperature,
      ...(topP === null ? {} : { top_p: topP }),
      max_tokens: maxTokens,
      stream: false,
      ...extraBody,
    }),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NVIDIA API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  noteModelCall(model, data.usage);
  return data.choices?.[0]?.message?.content ?? '';
}

// Yields { type: 'text', text } for content deltas, and — if the model
// requests one or more function calls — a single { type: 'tool_calls',
// toolCalls: [{id, name, arguments}] } event once the stream finishes.
// `arguments` arrives fragmented as partial JSON strings across many chunks
// (keyed by index) and must be concatenated; this accumulates that for you.
export async function* nvidiaChatCompletionStream({ apiKey, baseUrl, model, messages, maxTokens = 600, tools, topP = 0.9, extraBody = {} }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      ...(topP === null ? {} : { top_p: topP }),
      max_tokens: maxTokens,
      stream: true,
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
      ...extraBody,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`NVIDIA API error (${res.status}): ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const toolCallsAcc = {};
  let finishReason = null;
  // Token counts, when the provider includes them in the stream.
  let usage = null;
  try {
    const flushToolCalls = function* () {
      if (finishReason === 'tool_calls' && Object.keys(toolCallsAcc).length) {
        yield { type: 'tool_calls', toolCalls: Object.values(toolCallsAcc) };
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const line = event.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') {
          yield* flushToolCalls();
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        if (parsed.usage) usage = parsed.usage;
        const choice = parsed.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta;
        if (delta?.content) yield { type: 'text', text: delta.content };

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: '', name: '', arguments: '' };
            if (tc.id) toolCallsAcc[idx].id = tc.id;
            if (tc.function?.name) toolCallsAcc[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCallsAcc[idx].arguments += tc.function.arguments;
          }
        }
      }
    }

    yield* flushToolCalls();
  } finally {
    noteModelCall(model, usage);
  }
}
