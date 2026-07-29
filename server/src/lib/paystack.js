export const PAYSTACK_BASE_URL = 'https://api.paystack.co';

async function paystackRequest(secretKey, path, options = {}) {
  const res = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status === false) {
    throw new Error(data?.message || `Paystack API error (${res.status})`);
  }
  return data;
}

export async function paystackTestConnection(secretKey) {
  const data = await paystackRequest(secretKey, '/transaction/totals');
  const total = data?.data?.total_transactions ?? 0;
  return `Connected — ${total} total transaction${total === 1 ? '' : 's'} on this account.`;
}
