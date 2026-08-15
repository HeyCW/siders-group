import { SectionHeading } from '../layout/SectionHeading';
import { MediaSlot } from '../ui/MediaSlot';
import { Reveal } from '../ui/Reveal';
import { EDITION, GUIDE_OF_THE_WEEK } from '../../lib/content';

export function GuideOfWeek() {
  return (
    <div className="pt-[clamp(32px,5vw,64px)]">
      <SectionHeading title="Siders Guide of the Week" trailing={EDITION} />
      <Reveal delayMs={90} className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {GUIDE_OF_THE_WEEK.map((pick, i) => (
          <div
            key={pick.place}
            className={`py-[clamp(16px,2.5vw,24px)] ${
              i === 0
                ? 'border-b border-r border-rule border-r-rule-strong pr-[clamp(14px,2vw,28px)]'
                : 'border-b border-rule pl-[clamp(14px,2vw,28px)]'
            }`}
          >
            <div className="font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
              {pick.city}
            </div>
            <div className="my-2 font-serif text-[clamp(22px,2.6vw,30px)] font-bold leading-[1.1] tracking-[-0.02em]">
              {pick.place}
            </div>
            <MediaSlot
              src={null}
              alt={pick.place}
              label={`Drop ${pick.city} guide photo`}
              aspectClassName="aspect-[4/3]"
            />
            <p className="mt-3 text-[13px] leading-[1.65]">{pick.description}</p>
          </div>
        ))}
      </Reveal>
    </div>
  );
}
