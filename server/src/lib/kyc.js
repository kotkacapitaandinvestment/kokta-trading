// Identity details for KYC. Personal fields are validated here and stored
// encrypted as one JSON document (schema version `v`), so document uploads
// can be added later as a separate record without touching this shape.

import { COUNTRY_CODES, COUNTRIES } from './countries.js';
import { encryptSecret, decryptSecret } from './crypto.js';

export const KYC_STATUSES = ['pending', 'approved', 'rejected'];
export const MIN_AGE = 18;

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const countryName = (code) => COUNTRIES.find((c) => c.code === code)?.name ?? code;

function str(value, max) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max + 1) : '';
}

function ageOn(dob, today = new Date()) {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Returns { details } or { errors: { field: message } }.
export function validateKycDetails(input = {}) {
  const errors = {};
  const firstName = str(input.firstName, 60);
  const middleName = str(input.middleName, 60);
  const lastName = str(input.lastName, 60);
  const dateOfBirth = str(input.dateOfBirth, 10);
  const country = str(input.country, 2).toUpperCase();
  const phoneRaw = str(input.phone, 30);
  const address = input.address && typeof input.address === 'object' ? input.address : {};
  const line1 = str(address.line1, 120);
  const line2 = str(address.line2, 120);
  const city = str(address.city, 80);
  const region = str(address.region, 80);
  const postalCode = str(address.postalCode, 20);

  if (!firstName) errors.firstName = 'Enter your legal first name.';
  else if (firstName.length > 60 || !NAME_RE.test(firstName)) errors.firstName = 'Use letters, spaces, hyphens or apostrophes only.';
  if (middleName && (middleName.length > 60 || !NAME_RE.test(middleName))) errors.middleName = 'Use letters, spaces, hyphens or apostrophes only.';
  if (!lastName) errors.lastName = 'Enter your legal last name.';
  else if (lastName.length > 60 || !NAME_RE.test(lastName)) errors.lastName = 'Use letters, spaces, hyphens or apostrophes only.';

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  const dob = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  if (!dob || dob.getUTCMonth() !== +m[2] - 1 || dob.getUTCDate() !== +m[3]) errors.dateOfBirth = 'Enter your date of birth.';
  else if (ageOn(dob) < MIN_AGE) errors.dateOfBirth = `You must be at least ${MIN_AGE} to use Kotka.`;
  else if (ageOn(dob) > 120) errors.dateOfBirth = 'Check the year of birth.';

  if (!COUNTRY_CODES.has(country)) errors.country = 'Choose your country of residence.';

  const phone = phoneRaw.replace(/[\s().-]/g, '');
  if (!phone) errors.phone = 'Enter a phone number.';
  else if (!/^\+[1-9]\d{6,14}$/.test(phone)) errors.phone = 'Include the country code, for example +234 803 123 4567.';

  if (!line1 || line1.length < 3) errors['address.line1'] = 'Enter your street address.';
  else if (line1.length > 120) errors['address.line1'] = 'Keep this under 120 characters.';
  if (line2.length > 120) errors['address.line2'] = 'Keep this under 120 characters.';
  if (!city || city.length < 2) errors['address.city'] = 'Enter your city or town.';
  else if (city.length > 80) errors['address.city'] = 'Keep this under 80 characters.';
  if (region.length > 80) errors['address.region'] = 'Keep this under 80 characters.';
  if (postalCode.length > 20) errors['address.postalCode'] = 'Keep this under 20 characters.';

  if (Object.keys(errors).length) return { errors };
  return {
    details: {
      v: 1,
      firstName,
      middleName: middleName || null,
      lastName,
      dateOfBirth,
      country,
      phone,
      address: { line1, line2: line2 || null, city, region: region || null, postalCode: postalCode || null },
    },
  };
}

export function sealDetails(details) {
  return encryptSecret(JSON.stringify(details));
}

export function openDetails(cipher) {
  try {
    return JSON.parse(decryptSecret(cipher));
  } catch {
    return null;
  }
}

export function kycView(profile, { withDetails = false } = {}) {
  if (!profile) return { status: 'none' };
  return {
    id: profile.id,
    status: profile.status,
    country: profile.country,
    countryName: countryName(profile.country),
    submittedAt: profile.submittedAt,
    reviewedAt: profile.reviewedAt,
    reviewNote: profile.status === 'rejected' ? profile.reviewNote : null,
    ...(withDetails ? { details: openDetails(profile.detailsCipher) } : {}),
  };
}
