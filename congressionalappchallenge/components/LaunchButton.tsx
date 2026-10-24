'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Opens the app through dixi://open. The app only focuses and prefills; nothing runs.
 *  If the page still has focus 1.5 s later, the protocol probably isn't installed. Say so politely. */
export function LaunchButton({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const onClick = () => {
    setFailed(false);
    clearTimeout(timer.current);
    const cancel = () => clearTimeout(timer.current);
    window.addEventListener('blur', cancel, { once: true });
    document.addEventListener('visibilitychange', cancel, { once: true });
    timer.current = setTimeout(() => setFailed(document.hasFocus() && !document.hidden), 1500);
  };

  return (
    <>
      <Button asChild className={cn('w-full sm:w-auto', className)}>
        <a href="dixi://open" onClick={onClick}>
          Launch Dixi
        </a>
      </Button>
      <p aria-live="polite" className={cn('text-[15px] text-fg-2', !failed && 'sr-only')}>
        {failed ? (
          <>
            Couldn’t open Dixi. Is it installed? <a href="#launch" className="text-fg underline underline-offset-4">Get it here</a>.
          </>
        ) : null}
      </p>
    </>
  );
}
