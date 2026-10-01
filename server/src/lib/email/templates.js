// Kotka's emails. Plain, short and in the same voice as the app. Every
// value placed in HTML is escaped. No tracking pixels, no remote images.

import { CANONICAL_ORIGIN } from '../origins.js';
import { CONTACT } from '../contact.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';
const when = (d = new Date()) => `${d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;

function layout({ title, intro, paragraphs = [], button, footnote, support = CONTACT.support }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:13px;font-weight:600;letter-spacing:.14em;color:#b08a3e">KOTKA</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:600;line-height:1.3">${esc(title)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#3f3f46">${esc(intro)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#3f3f46">${esc(p)}</td></tr>`).join('')}
${button ? `<tr><td style="padding-top:24px"><a href="${esc(button.url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></td></tr>
<tr><td style="padding-top:12px;font-size:12px;line-height:1.5;color:#71717a">If the button doesn’t work, copy this link into your browser:<br><span style="word-break:break-all">${esc(button.url)}</span></td></tr>` : ''}
${footnote ? `<tr><td style="padding-top:24px;font-size:12px;line-height:1.5;color:#71717a">${esc(footnote)}</td></tr>` : ''}
<tr><td style="padding-top:24px;border-top:1px solid #eee;margin-top:24px;font-size:12px;line-height:1.5;color:#a1a1aa">Kotka Trading · Discipline is freedom. Need help? Email <a href="mailto:${esc(support)}" style="color:#71717a">${esc(support)}</a>. Kotka staff will never ask for your password or a code.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, '', intro, ...paragraphs.flatMap((p) => ['', p]), ...(button ? ['', `${button.label}: ${button.url}`] : []), ...(footnote ? ['', footnote] : []), '', `Kotka Trading. Need help? Email ${support}. Kotka staff will never ask for your password or a code.`].join('\n');
  return { html, text };
}

// verifyUrl is left out when the address was already confirmed with a
// sign-up code.
export function welcomeEmail({ name, verifyUrl, support }) {
  const firstDay = 'A good first day: tick the pre-trade checklist before your next trade, log it in your journal, and set one small goal in the Goal Room.';
  if (!verifyUrl) {
    return {
      subject: 'Welcome to Kotka',
      tag: 'welcome',
      ...layout({
        support,
        title: `Welcome to Kotka, ${firstName(name)}`,
        intro: 'Your account is ready and your email is confirmed.',
        paragraphs: [firstDay],
        button: { label: 'Open Kotka', url: `${CANONICAL_ORIGIN}/app/dashboard` },
      }),
    };
  }
  return {
    subject: 'Welcome to Kotka: confirm your email',
    tag: 'welcome',
    ...layout({
      support,
      title: `Welcome to Kotka, ${firstName(name)}`,
      intro: 'Please confirm this is your email address, so we can reach you about your account and help you back in if you forget your password.',
      paragraphs: [firstDay],
      button: { label: 'Confirm my email', url: verifyUrl },
      footnote: 'This link works for 48 hours. If you didn’t create a Kotka account, you can ignore this email.',
    }),
  };
}

// To the support inbox: a new help request, or a trader's follow-up.
export function supportTicketEmail({ ticket, name, body, topicLabel, followUp = false }) {
  return {
    subject: `${followUp ? 'Re: ' : ''}[Kotka support] ${ticket.subject}`,
    tag: 'support',
    ...layout({
      title: followUp ? 'A trader replied to their request' : 'New help request',
      intro: `${topicLabel}${name ? ` · from ${name}` : ''}${ticket.matchId ? ` · about match ${ticket.matchId}` : ''}`,
      paragraphs: String(body).split(/\n{2,}/).slice(0, 20),
      button: { label: 'Open in Admin → Support', url: `${CANONICAL_ORIGIN}/admin/support?ticket=${ticket.id}` },
      footnote: 'Reply from Admin → Support so the trader sees it in the app too.',
    }),
  };
}

// To a trader: support replied.
export function supportReplyEmail({ subject, body, ticketId }) {
  return {
    subject: `Re: ${subject}`,
    tag: 'support',
    ...layout({
      title: 'Kotka support replied',
      intro: `About: ${subject}`,
      paragraphs: String(body).split(/\n{2,}/).slice(0, 20),
      button: { label: 'See the conversation', url: `${CANONICAL_ORIGIN}/app/support/${ticketId}` },
      footnote: 'You can reply in the app. Kotka staff will never ask for your password or a code.',
    }),
  };
}

// For Super Admins: what needs a person, from the hourly checks.
export function opsDigestEmail({ items }) {
  return {
    subject: `Kotka: ${items.length} thing${items.length === 1 ? '' : 's'} to look at`,
    tag: 'ops',
    ...layout({
      title: 'Things to look at',
      intro: 'The hourly checks found these. Each links back to the admin pages where you can act on it.',
      paragraphs: items.map((i) => `• ${i.text}`),
      button: { label: 'Open System Status', url: `${CANONICAL_ORIGIN}/admin/system-health` },
      footnote: 'Sent to Super Admins and the support address. You get one of these only when something new comes up.',
    }),
  };
}

export function signupCodeEmail({ code, support }) {
  return {
    subject: `${code} is your Kotka code`,
    tag: 'signup_code',
    ...layout({
      support,
      title: 'Your Kotka sign-up code',
      intro: `Enter this code to finish creating your account: ${code}`,
      paragraphs: ['It works once, for 15 minutes.'],
      footnote: 'If you didn’t try to sign up for Kotka, you can ignore this email: no account is made without the code.',
    }),
  };
}

// Someone tried to sign up with an address that already has an account.
export function accountExistsEmail({ name, support }) {
  return {
    subject: 'You already have a Kotka account',
    tag: 'account_exists',
    ...layout({
      support,
      title: `You already have an account, ${firstName(name)}`,
      intro: 'Someone (hopefully you) just tried to create a Kotka account with this email address. It already has one, so no new account was made.',
      paragraphs: ['If it was you, sign in instead. If you’ve forgotten your password, you can reset it from the sign-in page.'],
      button: { label: 'Sign in', url: `${CANONICAL_ORIGIN}/login` },
      footnote: 'If this wasn’t you, you can ignore this email. Nobody can sign in without your password.',
    }),
  };
}

export function verifyEmail({ name, verifyUrl, support }) {
  return {
    subject: 'Confirm your email for Kotka',
    tag: 'verify',
    ...layout({
      support,
      title: `Confirm your email, ${firstName(name)}`,
      intro: 'Tap the button to confirm this is your email address.',
      button: { label: 'Confirm my email', url: verifyUrl },
      footnote: 'This link works for 48 hours. If you didn’t ask for this, you can ignore it.',
    }),
  };
}

export function passwordResetEmail({ name, resetUrl, support }) {
  return {
    subject: 'Reset your Kotka password',
    tag: 'password_reset',
    ...layout({
      support,
      title: `Reset your password, ${firstName(name)}`,
      intro: 'Someone (hopefully you) asked to reset the password for your Kotka account. The link below works once, for 30 minutes.',
      button: { label: 'Choose a new password', url: resetUrl },
      footnote: 'If you didn’t ask for this, you can ignore this email: your password stays the same. Resetting signs you out on every other device.',
    }),
  };
}

export function passwordChangedEmail({ name, device, via, support }) {
  return {
    subject: 'Your Kotka password was changed',
    tag: 'security',
    ...layout({
      support,
      title: 'Your password was changed',
      intro: `Hi ${firstName(name)}, the password for your Kotka account was ${via === 'reset' ? 'reset using an emailed link' : 'changed in Settings'} on ${when()}${device ? ` from ${device}` : ''}. Every other device was signed out.`,
      paragraphs: ['If this was you, there’s nothing else to do.'],
      button: { label: 'This wasn’t me: secure my account', url: `${CANONICAL_ORIGIN}/forgot-password` },
      footnote: `If you can’t get in, use “Forgot password?” on the sign-in page or email ${support ?? CONTACT.support}.`,
    }),
  };
}

export function newSignInEmail({ name, device, ip, support }) {
  return {
    subject: 'New sign-in to your Kotka account',
    tag: 'security',
    ...layout({
      support,
      title: 'New sign-in to your account',
      intro: `Hi ${firstName(name)}, your Kotka account was just signed in to from a device we haven’t seen before.`,
      paragraphs: [`Device: ${device ?? 'Unknown'}`, `When: ${when()}`, ...(ip ? [`Network address: ${ip}`] : [])],
      button: { label: 'Review signed-in devices', url: `${CANONICAL_ORIGIN}/app/settings?section=security` },
      footnote: 'If this wasn’t you, change your password straight away: that signs out every other device. Turning on two-step verification stops this happening again.',
    }),
  };
}

export function twoStepEmail({ name, on, support }) {
  return {
    subject: on ? 'Two-step verification is on' : 'Two-step verification was turned off',
    tag: 'security',
    ...layout({
      support,
      title: on ? 'Two-step verification is on' : 'Two-step verification was turned off',
      intro: on
        ? `Hi ${firstName(name)}, your Kotka account now asks for a code from your authenticator app after your password. Keep your recovery codes somewhere safe.`
        : `Hi ${firstName(name)}, two-step verification was turned off for your Kotka account on ${when()}. Signing in now needs only your password.`,
      button: { label: 'Open security settings', url: `${CANONICAL_ORIGIN}/app/settings?section=security` },
      footnote: on ? undefined : 'If this wasn’t you, reset your password straight away and turn two-step verification back on.',
    }),
  };
}
