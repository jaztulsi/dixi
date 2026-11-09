'use client';

import { useEffect, useRef, useState } from 'react';
import { MascotSprite } from '@/components/MascotSprite';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY;

// Limits match the table's checks (supabase/waitlist.sql).
const FIELDS = [
  { name: 'first_name', label: 'First name', type: 'text', max: 100, auto: 'given-name' },
  { name: 'last_name', label: 'Last name', type: 'text', max: 100, auto: 'family-name' },
  { name: 'email', label: 'Email', type: 'email', max: 254, auto: 'email', pattern: String.raw`[^@\s]+@[^@\s]+\.[^@\s]+` },
  { name: 'phone', label: 'Phone (optional)', type: 'tel', max: 30, auto: 'tel', optional: true, pattern: String.raw`\+?[ \(\)\.\-]*([0-9][ \(\)\.\-]*){7,15}` },
];

type State = 'idle' | 'joined' | 'already' | 'invalid' | 'failed';

const MESSAGE: Record<State, string> = {
  idle: '',
  joined: '',
  already: '',
  invalid: 'Something doesn’t look right. Check your email and phone number.',
  failed: 'Couldn’t add you just now. Please try again.',
};

/** Email waitlist. Inserts straight into Supabase's REST API; the table is insert-only for this key
 *  (supabase/waitlist.sql), so the list can't be read back from the browser. */
export function Waitlist({ className }: { className?: string }) {
  const [state, setState] = useState<State>('idle');
  const [name, setName] = useState('');
  const thanks = useRef<HTMLHeadingElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const done = state === 'joined' || state === 'already';

  // The form hides on success; move focus to the thank-you, or to the error if the form comes back, for keyboard and screen-reader users.
  useEffect(() => {
    if (done) thanks.current?.focus();
    else if (state !== 'idle') note.current?.focus();
  }, [done, state]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const field = (name: string) => String(form.get(name)).trim();
    setName(field('first_name'));
    // ponytail: honeypot only stops simple form-filling bots; add Cloudflare Turnstile if real spam gets through.
    // Saving a new row takes Supabase several seconds, so thank them now. A failure brings the form back, values intact.
    setState('joined');
    if (field('company')) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: 'POST',
        keepalive: true, // finishes even if they close the tab straight after the thank-you
        headers: { apikey: SUPABASE_KEY!, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          first_name: field('first_name'),
          last_name: field('last_name'),
          email: field('email').toLowerCase(),
          phone: field('phone') || null,
        }),
      });
      // 409: email already there. 400: a table check rejected a value (e.g. a phone with too few digits).
      if (!res.ok) setState(res.status === 409 ? 'already' : res.status === 400 ? 'invalid' : 'failed');
    } catch {
      setState('failed');
    }
  };

  return (
    // One glass panel for both the form and the thank-you, so submitting swaps its contents instead of the layout.
    <div className={cn('glass w-full max-w-[520px] rounded-[var(--radius-panel)] p-6 sm:p-8', className)}>
      {done && (
        <div className="flex flex-col items-center">
          <MascotSprite pose="happy" height={120} eager className="mascot-shadow" />
          <h3 ref={thanks} tabIndex={-1} className="mt-4 text-[32px] leading-none font-bold tracking-[-0.035em] text-balance text-fg outline-none">
            Thank you{name && `, ${name}`}!
          </h3>
          <p className="mt-4 text-fg-2 text-balance">
            {state === 'already' ? 'You’re already on the Dixi waitlist.' : 'You’re on the Dixi waitlist.'} Stay tuned for more updates.
          </p>
        </div>
      )}
      <form onSubmit={onSubmit} className={cn('w-full gap-4 text-left sm:grid-cols-2', done ? 'hidden' : 'grid')}>
        {FIELDS.map((f) => (
          <label key={f.name} className={cn('flex flex-col gap-2', f.type !== 'text' && 'sm:col-span-2')}>
            <span className="pl-6 text-[15px] font-semibold text-fg">{f.label}</span>
            <input
              name={f.name}
              type={f.type}
              required={!f.optional}
              maxLength={f.max}
              autoComplete={f.auto}
              pattern={f.pattern}
              className="h-12 w-full rounded-full border border-line bg-paper px-6 text-[17px] text-fg"
            />
          </label>
        ))}
        {/* Honeypot: off-screen and skipped by keyboard and screen readers, so only bots fill it in. */}
        <div aria-hidden="true" className="absolute -left-[9999px]">
          <input name="company" tabIndex={-1} autoComplete="off" />
        </div>
        <Button type="submit" className="mt-2 w-full sm:col-span-2">
          Join the waitlist
        </Button>
        <p ref={note} tabIndex={-1} aria-live="polite" className="text-center text-[15px] text-balance text-fg-2 outline-none sm:col-span-2">
          {MESSAGE[state] || 'Private beta on Mac, Windows and Linux. We’ll only use this to send you Dixi updates.'}
        </p>
      </form>
    </div>
  );
}
