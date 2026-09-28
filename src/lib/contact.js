// Kotka's public email addresses. One place, so they stay consistent.
// The support address can be overridden in Admin → Platform Settings.
export const CONTACT = {
  support: 'support@kotkafinance.online', // help with an account: sign-in, verification, safety
  hello: 'hello@kotkafinance.online', // say hello, feedback, ideas
  info: 'info@kotkafinance.online', // general questions about Kotka
  contact: 'contact@kotkafinance.online', // partnerships, press and business
};

export const mailto = (address, subject) => `mailto:${address}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`;
