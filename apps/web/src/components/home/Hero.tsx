import { MANIFESTO } from '../../lib/content';

export function Hero() {
  return (
    <div className="sm:min-h-[277px] py-[clamp(32px,6vw,72px)] pb-[clamp(24px,4vw,44px)] text-center">
      <div
        className="motion-safe:animate-riseIn font-serif text-[clamp(42px,6.5vw,52px)] font-bold uppercase leading-[1.06] tracking-[-0.04em]"
        style={{ animationDelay: '220ms' }}
      >
        {MANIFESTO.headline}
      </div>
      <div
        className="motion-safe:animate-riseIn mt-[clamp(6px,1vw,14px)] font-serif text-[clamp(44px,8.5vw,69px)] font-bold uppercase leading-[1.02] tracking-[-0.04em]"
        style={{ animationDelay: '320ms' }}
      >
        {MANIFESTO.subhead}{' '}
        <span className="inline-block bg-signal px-[0.15em] leading-[0.74]">SIDERS.</span>
      </div>
    </div>
  );
}
