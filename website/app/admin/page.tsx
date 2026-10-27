import type { Metadata } from 'next';
import { Admin } from '@/components/Admin';

export const metadata: Metadata = {
  title: 'Waitlist admin · Dixi',
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <main className="px-4 pt-16 pb-32 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-[1120px]">
        <Admin />
      </div>
    </main>
  );
}
