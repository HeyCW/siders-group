import { MANIFESTO } from '../../lib/content';

export function IntroBlurb() {
  const [first, second, third] = MANIFESTO.intro;
  return (
    <div className="mt-[clamp(20px,3vw,32px)] grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] gap-0 border-t border-ink pt-[clamp(16px,2.5vw,24px)]">
      <div className="border-r border-rule-strong pr-[clamp(14px,2vw,28px)]">
        <p className="text-left text-[13px] leading-[1.65]">
          <span className="float-left pr-1.5 font-serif text-[38px] font-bold leading-[0.82]">
            {first?.[0]}
          </span>
          {first?.slice(1)}
        </p>
      </div>
      <div className="border-r border-rule-strong px-[clamp(14px,2vw,28px)]">
        <p className="text-left text-[13px] leading-[1.65]">{second}</p>
      </div>
      <div className="pl-[clamp(14px,2vw,28px)]">
        <p className="text-left text-[13px] leading-[1.65]">{third}</p>
      </div>
    </div>
  );
}
