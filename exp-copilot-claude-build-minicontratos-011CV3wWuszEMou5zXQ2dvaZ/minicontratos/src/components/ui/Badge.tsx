import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'destructive';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
        {
          'bg-blue-600 text-white': variant === 'default',
          'bg-gray-100 text-gray-900': variant === 'secondary',
          'border border-gray-300 text-gray-900': variant === 'outline',
          'bg-red-600 text-white': variant === 'destructive',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
