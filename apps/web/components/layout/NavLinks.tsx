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
            className={`px-2 py-1.5 font-sans text-[11px] font-bold uppercase tracking-widest ${active ? 'bg-signal' : 'bg-transparent'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </span>
  );
}
