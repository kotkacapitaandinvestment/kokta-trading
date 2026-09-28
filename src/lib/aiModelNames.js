// Readable names for the NVIDIA-hosted models Kotka AI uses. Admin screens
// show these; the full model ID stays available as a tooltip.
const NAMES = {
  'nvidia/nemotron-3-super-120b-a12b': 'Nemotron Super',
  'nvidia/nemotron-3-ultra-550b-a55b': 'Nemotron Ultra',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': 'Nemotron Nano Vision',
  'moonshotai/kimi-k3': 'Kimi K3',
  'meta/llama-3.2-11b-vision-instruct': 'Llama Vision Small',
  'meta/llama-3.2-90b-vision-instruct': 'Llama Vision Large',
};

export function modelName(id) {
  if (!id) return null;
  if (NAMES[id]) return NAMES[id];
  // Unknown model: "vendor/some-model-name-7b" becomes "Some Model Name".
  const words = String(id).split('/').pop().split(/[-_]/).filter((w) => !/^\d+(\.\d+)?[bm]?$|^a\d+b$|^v?\d/i.test(w));
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || id;
}

// What each health state means for an admin.
export const MODEL_STATE = {
  ok: 'Working',
  degraded: 'Slow or failing',
  retired: 'Retired by NVIDIA',
  unavailable: 'Not available',
  untested: 'Not checked yet',
  incompatible: 'Doesn’t work with Kotka',
};

export const MODEL_ROLE = { chat: 'Chat', vision: 'Chart reading', narrative: 'Research summaries', text: 'Chat' };
