import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// shadcn/ui Button, cut down to the two pills the site uses.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none transition-transform duration-150 active:scale-[.97] motion-reduce:transition-none',
  {
    variants: {
      variant: {
        primary: 'bg-text text-bg', // solid white pill, black text (21:1)
        glass: 'glass text-fg',
      },
      size: {
        default: 'h-12 px-6 text-[17px]',
        sm: 'h-10 px-4 text-[15px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
