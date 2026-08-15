'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '../../lib/content';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  return (
    <span className={`flex gap-0.5 ${className}`}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative px-2 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest ${
              active
                ? 'bg-signal'
                : 'bg-transparent after:absolute after:inset-x-2 after:-bottom-px after:h-[2px] after:origin-left after:scale-x-0 after:bg-signal after:transition-transform after:duration-hover after:ease-hover after:content-[""] hover:after:scale-x-100 focus-visible:after:scale-x-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </span>
  );
}
