import { MANIFESTO } from '../../lib/content';

export function IntroBlurb() {
  const [first, second] = MANIFESTO.intro;
  return (
    <div className="mt-[clamp(20px,3vw,32px)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-0 border-t border-ink pt-[clamp(16px,2.5vw,24px)]">
      <div
        className="motion-safe:animate-riseIn border-r border-rule-strong pr-[clamp(14px,2vw,28px)]"
        style={{ animationDelay: '420ms' }}
      >
        <p className="text-left text-[clamp(16px,2vw,20px)] leading-[1.6]">
          <span className="float-left pr-2 font-serif text-[48px] font-bold leading-[calc(1.6*clamp(16px,2vw,20px))]">
            {first?.[0]}
          </span>
          {first?.slice(1)}
        </p>
      </div>
      <div
        className="motion-safe:animate-riseIn relative pl-[clamp(14px,2vw,28px)]"
        style={{ animationDelay: '480ms' }}
      >
        <p className="text-left text-[clamp(16px,2vw,20px)] leading-[1.6]">{second}</p>
        <video
          className="pointer-events-none absolute bottom-0 right-0 h-[clamp(56px,7vw,88px)] w-[clamp(56px,7vw,88px)] rounded-full object-cover"
          src="/video/manifesto-loop.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>
    </div>
  );
}
