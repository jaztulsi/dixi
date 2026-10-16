'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { Picture } from '@/components/Picture';

/** The hero bust with a slow parallax (transform only). Its lower half fades out so the headline sits on black. */
export function HeroBust() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 800], [0, reduced ? 0 : 120]);

  return (
    <motion.div style={{ y }} className="pointer-events-none absolute inset-x-0 top-16 mx-auto w-[min(78vw,560px)] sm:top-12">
      <Picture
        name="bust"
        widths={[640, 1200]}
        width={1200}
        height={1375}
        alt="Roman marble portrait bust of a bearded man, mid-3rd century CE"
        sizes="min(78vw, 560px)"
        priority
        className="h-auto w-full [mask-image:linear-gradient(to_bottom,var(--bg)_45%,transparent_78%)]"
      />
    </motion.div>
  );
}
