import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { AlertCircle, ArrowRight, BadgeCheck, Clock3, Lock, LogOut } from 'lucide-react';
import BrandMark from '../../components/ui/BrandMark';
import Input, { Select } from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useAppConfig } from '../../context/AppConfigContext';
import { api } from '../../lib/api';
import { COUNTRIES } from '../../lib/countries';

const EMPTY = {
  firstName: '',
  middleName: '',
  lastName: '',
  dateOfBirth: '',
  country: '',
  phone: '',
  address: { line1: '', line2: '', city: '', region: '', postalCode: '' },
};

function latestAdultBirthday() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

function fromDetails(details) {
  if (!details) return EMPTY;
  return {
    firstName: details.firstName ?? '',
    middleName: details.middleName ?? '',
    lastName: details.lastName ?? '',
    dateOfBirth: details.dateOfBirth ?? '',
    country: details.country ?? '',
    phone: details.phone ?? '',
    address: {
      line1: details.address?.line1 ?? '',
      line2: details.address?.line2 ?? '',
      city: details.address?.city ?? '',
      region: details.address?.region ?? '',
      postalCode: details.address?.postalCode ?? '',
    },
  };
}

const STEPS = [
  { key: 'identity', label: 'Legal name', hint: 'Exactly as it appears on your government ID.' },
  { key: 'contact', label: 'Birth date and contact', hint: 'You must be 18 or older.' },
  { key: 'address', label: 'Residential address', hint: 'Where you live now, not a P.O. box.' },
];

function FormSection({ index, step, children }) {
  return (
    <section className="grid grid-cols-1 gap-x-10 gap-y-4 border-t border-ink-100 py-8 first:border-t-0 first:pt-0 dark:border-ink-800 md:grid-cols-[13rem_1fr]">
      <div>
        <p className="font-mono text-[11px] tabular-nums text-accent-600 dark:text-accent-400">0{index + 1}</p>
        <h2 className="mt-1 text-sm font-semibold text-ink-900 dark:text-ink-50">{step.label}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{step.hint}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function StatusPanel({ kyc, onEdit }) {
  const pending = kyc.status === 'pending';
  const Icon = pending ? Clock3 : BadgeCheck;
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
      <div className="flex items-start gap-4">
        <span
          className={clsx(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            pending ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-profit-50 text-profit-600 dark:bg-profit-500/10 dark:text-profit-400',
          )}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-900 dark:text-ink-50">{pending ? 'Your details are in review' : 'Your identity is verified'}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
            {pending
              ? 'You have full access while we check them. We will let you know here if anything needs correcting.'
              : 'Nothing else is needed. To change verified details, contact support.'}
          </p>
          <p className="mt-3 text-xs text-ink-400">
            Submitted {new Date(kyc.submittedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            {kyc.countryName ? ` · ${kyc.countryName}` : ''}
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button as={Link} to="/app/dashboard" iconRight={ArrowRight}>Go to dashboard</Button>
        {pending ? (
          <Button variant="secondary" onClick={onEdit}>Correct my details</Button>
        ) : null}
      </div>
    </div>
  );
}

export default function VerifyIdentity() {
  const { user, loading: authLoading, patchUser, logout } = useAuth();
  const config = useAppConfig();
  const navigate = useNavigate();
  const [kyc, setKyc] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});

  useEffect(() => {
    if (!user) return;
    api
      .get('/kyc')
      .then(({ kyc }) => {
        setKyc(kyc);
        setForm(fromDetails(kyc.details));
        setEditing(kyc.status === 'none' || kyc.status === 'rejected');
      })
      .catch((err) => setError(err.message));
  }, [user]);

  const maxDob = useMemo(latestAdultBirthday, []);

  if (authLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setAddr = (key) => (e) => setForm((f) => ({ ...f, address: { ...f.address, [key]: e.target.value } }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setFields({});
    try {
      const { kyc: saved } = await api.post('/kyc', form);
      setKyc(saved);
      setEditing(false);
      patchUser({ kycStatus: saved.status });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err.message);
      setFields(err.fields ?? {});
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login');
  };

  const isAdmin = ['admin', 'super_admin'].includes(user.role);
  const rejected = kyc?.status === 'rejected';

  return (
    <div className="min-h-[100dvh] bg-ink-50 dark:bg-ink-950">
      <header className="border-b border-ink-100 bg-white/80 backdrop-blur dark:border-ink-800 dark:bg-ink-900/80">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">Kotka Trading</span>
          </Link>
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-100">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 lg:pt-14">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-400">Account verification</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
            {kyc?.status === 'approved' ? 'You are verified.' : `Confirm who you are, ${user.name.split(' ')[0]}.`}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
            Kotka verifies every trader account. It takes about two minutes, and you can use the platform while we review your details.
            {isAdmin ? ' Administrator accounts are exempt, so this is optional for you.' : ''}
          </p>
        </div>

        {!config.kycRequired && !isAdmin ? (
          <p className="mt-6 max-w-2xl rounded-xl bg-white px-4 py-3 text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-400">
            Verification is currently optional. You can still submit your details now.
          </p>
        ) : null}

        {!kyc ? (
          error ? (
            <div className="mt-10 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-4 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : (
            <div className="mt-10 h-96 animate-pulse rounded-2xl bg-white dark:bg-ink-900" />
          )
        ) : !editing ? (
          <div className="mt-10 max-w-2xl">
            <StatusPanel kyc={kyc} onEdit={() => setEditing(true)} />
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_17rem]">
            <form onSubmit={submit} noValidate className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900 sm:p-8">
              {rejected && kyc.reviewNote ? (
                <div className="mb-8 rounded-xl border border-loss-500/25 bg-loss-50 p-4 dark:bg-loss-500/10">
                  <p className="text-sm font-semibold text-loss-600 dark:text-loss-400">Please correct your details</p>
                  <p className="mt-1 text-sm text-loss-600/90 dark:text-loss-400/90">{kyc.reviewNote}</p>
                </div>
              ) : null}
              {error ? (
                <div role="alert" className="mb-8 flex items-start gap-2 rounded-xl border border-loss-500/20 bg-loss-50 p-3 text-sm text-loss-600 dark:bg-loss-500/10 dark:text-loss-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <FormSection index={0} step={STEPS[0]}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="First name" name="firstName" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} error={fields.firstName} required />
                  <Input label="Last name" name="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} error={fields.lastName} required />
                </div>
                <Input label="Middle name" name="middleName" autoComplete="additional-name" hint="Optional" value={form.middleName} onChange={set('middleName')} error={fields.middleName} />
              </FormSection>

              <FormSection index={1} step={STEPS[1]}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Date of birth" name="dateOfBirth" type="date" autoComplete="bday" max={maxDob} min="1906-01-01" value={form.dateOfBirth} onChange={set('dateOfBirth')} error={fields.dateOfBirth} required />
                  <Input label="Phone number" name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+234 803 123 4567" hint="Include your country code." value={form.phone} onChange={set('phone')} error={fields.phone} required />
                </div>
              </FormSection>

              <FormSection index={2} step={STEPS[2]}>
                <div>
                  <Select label="Country of residence" name="country" autoComplete="country" value={form.country} onChange={set('country')} required>
                    <option value="" disabled>Choose a country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </Select>
                  {fields.country ? <span className="mt-1 block text-xs text-loss-500">{fields.country}</span> : null}
                </div>
                <Input label="Street address" name="line1" autoComplete="address-line1" value={form.address.line1} onChange={setAddr('line1')} error={fields['address.line1']} required />
                <Input label="Apartment, suite, etc." name="line2" autoComplete="address-line2" hint="Optional" value={form.address.line2} onChange={setAddr('line2')} error={fields['address.line2']} />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Input label="City" name="city" autoComplete="address-level2" value={form.address.city} onChange={setAddr('city')} error={fields['address.city']} required />
                  <Input label="State / region" name="region" autoComplete="address-level1" hint="Optional" value={form.address.region} onChange={setAddr('region')} error={fields['address.region']} />
                  <Input label="Postal code" name="postalCode" autoComplete="postal-code" hint="Optional" value={form.address.postalCode} onChange={setAddr('postalCode')} error={fields['address.postalCode']} />
                </div>
              </FormSection>

              <div className="flex flex-col-reverse gap-3 border-t border-ink-100 pt-6 dark:border-ink-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-400">By submitting, you confirm these details are accurate and your own.</p>
                <div className="flex gap-2">
                  {kyc.status === 'pending' ? (
                    <Button type="button" variant="ghost" onClick={() => { setForm(fromDetails(kyc.details)); setEditing(false); }}>Cancel</Button>
                  ) : null}
                  <Button type="submit" disabled={saving} className="active:scale-[0.98]">
                    {saving ? 'Submitting…' : kyc.status === 'none' ? 'Submit for review' : 'Resubmit for review'}
                  </Button>
                </div>
              </div>
            </form>

            <aside className="space-y-6 text-sm lg:pt-2">
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink-800 dark:text-ink-100">
                  <Lock className="h-4 w-4 text-accent-600 dark:text-accent-400" strokeWidth={1.75} />
                  How we handle this
                </p>
                <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  <li>Your details are encrypted before they are stored.</li>
                  <li>Only Kotka administrators reviewing your account can open them, and every view is logged.</li>
                  <li>We never share them with brokers or advertisers.</li>
                </ul>
              </div>
              <div className="border-t border-ink-200 pt-6 dark:border-ink-800">
                <p className="font-semibold text-ink-800 dark:text-ink-100">What happens next</p>
                <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                  <li><span className="font-mono text-accent-600 dark:text-accent-400">1</span> You get full access straight away.</li>
                  <li><span className="font-mono text-accent-600 dark:text-accent-400">2</span> Our team reviews your details.</li>
                  <li><span className="font-mono text-accent-600 dark:text-accent-400">3</span> If anything needs fixing, you will see a note here and in Settings.</li>
                </ol>
              </div>
              {config.supportEmail ? (
                <p className="border-t border-ink-200 pt-6 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                  Questions? <a className="font-medium text-accent-600 hover:underline dark:text-accent-400" href={`mailto:${config.supportEmail}`}>{config.supportEmail}</a>
                </p>
              ) : null}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
