// Kotka's emails. Plain, short and in the same voice as the app. Every
// value placed in HTML is escaped. No tracking pixels, no remote images.

import { CANONICAL_ORIGIN } from '../origins.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';
const when = (d = new Date()) => `${d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;

function layout({ title, intro, paragraphs = [], button, footnote }) {
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
<tr><td style="padding-top:24px;border-top:1px solid #eee;margin-top:24px;font-size:12px;color:#a1a1aa">Kotka Trading · Discipline is freedom. Kotka staff will never ask for your password or a code.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [title, '', intro, ...paragraphs.flatMap((p) => ['', p]), ...(button ? ['', `${button.label}: ${button.url}`] : []), ...(footnote ? ['', footnote] : []), '', 'Kotka Trading. Kotka staff will never ask for your password or a code.'].join('\n');
  return { html, text };
}

export function welcomeEmail({ name, verifyUrl }) {
  return {
    subject: 'Welcome to Kotka: confirm your email',
    tag: 'welcome',
    ...layout({
      title: `Welcome to Kotka, ${firstName(name)}`,
      intro: 'Please confirm this is your email address, so we can reach you about your account and help you back in if you forget your password.',
      paragraphs: ['A good first day: tick the pre-trade checklist before your next trade, log it in your journal, and set one small goal in the Goal Room.'],
      button: { label: 'Confirm my email', url: verifyUrl },
      footnote: 'This link works for 48 hours. If you didn’t create a Kotka account, you can ignore this email.',
    }),
  };
}

export function verifyEmail({ name, verifyUrl }) {
  return {
    subject: 'Confirm your email for Kotka',
    tag: 'verify',
    ...layout({
      title: `Confirm your email, ${firstName(name)}`,
      intro: 'Tap the button to confirm this is your email address.',
      button: { label: 'Confirm my email', url: verifyUrl },
      footnote: 'This link works for 48 hours. If you didn’t ask for this, you can ignore it.',
    }),
  };
}

export function passwordResetEmail({ name, resetUrl }) {
  return {
    subject: 'Reset your Kotka password',
    tag: 'password_reset',
    ...layout({
      title: `Reset your password, ${firstName(name)}`,
      intro: 'Someone (hopefully you) asked to reset the password for your Kotka account. The link below works once, for 30 minutes.',
      button: { label: 'Choose a new password', url: resetUrl },
      footnote: 'If you didn’t ask for this, you can ignore this email: your password stays the same. Resetting signs you out on every other device.',
    }),
  };
}

export function passwordChangedEmail({ name, device, via }) {
  return {
    subject: 'Your Kotka password was changed',
    tag: 'security',
    ...layout({
      title: 'Your password was changed',
      intro: `Hi ${firstName(name)}, the password for your Kotka account was ${via === 'reset' ? 'reset using an emailed link' : 'changed in Settings'} on ${when()}${device ? ` from ${device}` : ''}. Every other device was signed out.`,
      paragraphs: ['If this was you, there’s nothing else to do.'],
      button: { label: 'This wasn’t me: secure my account', url: `${CANONICAL_ORIGIN}/forgot-password` },
      footnote: 'If you can’t get in, use “Forgot password?” on the sign-in page or contact Kotka support.',
    }),
  };
}

export function newSignInEmail({ name, device, ip }) {
  return {
    subject: 'New sign-in to your Kotka account',
    tag: 'security',
    ...layout({
      title: 'New sign-in to your account',
      intro: `Hi ${firstName(name)}, your Kotka account was just signed in to from a device we haven’t seen before.`,
      paragraphs: [`Device: ${device ?? 'Unknown'}`, `When: ${when()}`, ...(ip ? [`Network address: ${ip}`] : [])],
      button: { label: 'Review signed-in devices', url: `${CANONICAL_ORIGIN}/app/settings?section=security` },
      footnote: 'If this wasn’t you, change your password straight away: that signs out every other device. Turning on two-step verification stops this happening again.',
    }),
  };
}

export function twoStepEmail({ name, on }) {
  return {
    subject: on ? 'Two-step verification is on' : 'Two-step verification was turned off',
    tag: 'security',
    ...layout({
      title: on ? 'Two-step verification is on' : 'Two-step verification was turned off',
      intro: on
        ? `Hi ${firstName(name)}, your Kotka account now asks for a code from your authenticator app after your password. Keep your recovery codes somewhere safe.`
        : `Hi ${firstName(name)}, two-step verification was turned off for your Kotka account on ${when()}. Signing in now needs only your password.`,
      button: { label: 'Open security settings', url: `${CANONICAL_ORIGIN}/app/settings?section=security` },
      footnote: on ? undefined : 'If this wasn’t you, reset your password straight away and turn two-step verification back on.',
    }),
  };
}
