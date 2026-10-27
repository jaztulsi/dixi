'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY;
// ponytail: password-only sign-in, so the admin's email ships in the page's JS. Use a non-personal address if that matters.
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
const DAY = 864e5;

type Row = { email: string; first_name: string; last_name: string; phone: string | null; created_at: string };

// Names come from the public form: a cell starting with = + - @ would run as a formula in Excel/Sheets.
const cell = (v: string | null) => `"${(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
const toCsv = (rows: Row[]) =>
  ['First name,Last name,Email,Phone,Joined', ...rows.map((r) => [r.first_name, r.last_name, r.email, r.phone, r.created_at].map(cell).join(','))].join('\n');

/** Waitlist admin. Signs in to Supabase Auth as ADMIN_EMAIL with the password typed here and reads the table with that
 *  session; the "admin can read" policy in supabase/waitlist.sql decides who sees rows. The session lives in memory only. */
export function Admin() {
  const [token, setToken] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (t: string) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${t}` },
      });
      if (res.status === 401) return setToken(''), setRows(null), setError('Session expired. Sign in again.');
      if (!res.ok) return setError('Couldn’t load the waitlist.');
      setToken(t);
      setRows(await res.json());
    } catch {
      setError('Couldn’t reach Supabase.');
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY!, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: form.get('password') }),
      });
      if (!res.ok) return setBusy(false), setError('Wrong password.');
      await load((await res.json()).access_token);
    } catch {
      setBusy(false);
      setError('Couldn’t reach Supabase.');
    }
  };

  if (!rows)
    return (
      <form onSubmit={signIn} className="glass mx-auto mt-16 grid max-w-[440px] gap-4 rounded-[var(--radius-panel)] p-6 sm:p-8">
        <h1 className="text-[32px] leading-none font-bold tracking-[-0.035em] text-fg">Waitlist admin</h1>
        <label className="flex flex-col gap-2">
          <span className="pl-6 text-[15px] font-semibold text-fg">Password</span>
          <input name="password" type="password" required autoFocus autoComplete="current-password" className="h-12 w-full rounded-full border border-line bg-paper px-6 text-[17px] text-fg" />
        </label>
        <Button type="submit" disabled={busy} className="mt-2 w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p aria-live="polite" className="text-center text-[15px] text-fg-2">
          {error}
        </p>
      </form>
    );

  const now = Date.now();
  const since = (ms: number) => rows.filter((r) => now - Date.parse(r.created_at) < ms).length;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => `${r.first_name} ${r.last_name} ${r.email} ${r.phone ?? ''}`.toLowerCase().includes(q)) : rows;

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="t-headline text-fg">Waitlist.</h1>
        <div className="flex gap-3">
          <Button variant="glass" size="sm" disabled={busy} onClick={() => load(token)}>
            {busy ? 'Refreshing…' : 'Refresh'}
          </Button>
          <Button asChild size="sm">
            <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(rows))}`} download="dixi-waitlist.csv">
              Download CSV
            </a>
          </Button>
        </div>
      </div>
      <p aria-live="polite" className="mt-2 text-[15px] text-fg-2">
        {error}
      </p>

      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ['Total', rows.length],
          ['Last 24 hours', since(DAY)],
          ['Last 7 days', since(7 * DAY)],
        ].map(([label, n]) => (
          <div key={label} className="glass rounded-[var(--radius-panel)] p-6">
            <dt className="t-label">{label}</dt>
            <dd className="mt-2 text-[48px] leading-none font-bold tracking-[-0.035em] text-fg">{n}</dd>
          </div>
        ))}
      </dl>

      <div className="glass mt-8 rounded-[var(--radius-panel)] p-6 sm:p-8">
        <label className="flex flex-col gap-2 sm:max-w-[360px]">
          <span className="pl-6 text-[15px] font-semibold text-fg">Search</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-12 w-full rounded-full border border-line bg-paper px-6 text-[17px] text-fg" />
        </label>
        {shown.length ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-[15px]">
              <thead className="text-fg-2">
                <tr className="border-b border-line">
                  {['Name', 'Email', 'Phone', 'Joined'].map((h) => (
                    <th key={h} className="py-3 pr-6 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-fg">
                {shown.map((r) => (
                  <tr key={r.email} className="border-b border-line last:border-0">
                    <td className="py-3 pr-6 whitespace-nowrap">
                      {r.first_name} {r.last_name}
                    </td>
                    <td className="py-3 pr-6">
                      <a href={`mailto:${r.email}`} className="underline underline-offset-4">
                        {r.email}
                      </a>
                    </td>
                    <td className="py-3 pr-6 whitespace-nowrap">{r.phone ?? '—'}</td>
                    <td className="py-3 whitespace-nowrap text-fg-2">{new Date(r.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-6 text-fg-2">
            {q ? 'No matches.' : 'Nothing to show: no one has joined yet, or this account isn’t the admin in supabase/waitlist.sql.'}
          </p>
        )}
      </div>
    </>
  );
}
