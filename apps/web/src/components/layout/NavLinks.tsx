import { Link, useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../../lib/content';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** `stacked` is a distinct internal layout, not a class appended by the caller — Tailwind's
 *  compiled order (not the className string's order) decides which of two same-property
 *  utilities wins, so overriding `gap-0.5` via a caller-supplied class would be a silent
 *  coin flip rather than a guarantee. Used by `StickyNav`'s collapsed mobile menu, where the
 *  links run full-width and one per row instead of inline. */
export function NavLinks({
  className = '',
  stacked = false,
}: {
  className?: string;
  stacked?: boolean;
}) {
  const pathname = useLocation().pathname;
  return (
    <span className={`flex items-center ${stacked ? 'flex-col' : 'gap-0.5'} ${className}`}>
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            to={item.href}
            className={`relative px-2 font-sans text-[11px] font-bold uppercase tracking-widest ${
              stacked ? 'border-b border-rule py-3' : 'py-1.5'
            } ${
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
