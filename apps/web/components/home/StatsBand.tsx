import { Container } from '../layout/Container';
import { STATS } from '../../lib/content';

export function StatsBand() {
  return (
    <div className="border-y-[3px] border-ink bg-signal">
      <Container className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[clamp(20px,3vw,28px)] py-[clamp(24px,4vw,40px)]">
        {STATS.map((stat) => (
          <div key={stat.value}>
            <div className="font-serif text-[clamp(38px,5vw,64px)] font-black leading-[0.95] tracking-[-0.03em]">
              {stat.value}
            </div>
            <div className="mt-2 whitespace-pre-line font-sans text-[11px] font-bold uppercase tracking-widest">
              {stat.label}
            </div>
          </div>
        ))}
      </Container>
    </div>
  );
}
