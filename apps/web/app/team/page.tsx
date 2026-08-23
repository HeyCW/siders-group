import type { Metadata } from 'next';
import { Container } from '../../components/layout/Container';
import { MediaSlot } from '../../components/ui/MediaSlot';
import { TEAM } from '../../lib/content';

export const metadata: Metadata = {
  title: 'Team — Siders',
  description: 'The people building the masthead, city by city.',
};

export default function TeamPage() {
  return (
    <div>
      <Container className="pt-[clamp(24px,4vw,44px)]">
        <div className="border-b-[3px] border-ink pb-3">
          <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
            Behind The Siders
          </h1>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {TEAM.map((member) => (
            <div
              key={member.id}
              className="border-b border-rule border-r border-r-rule-strong py-[clamp(20px,3vw,32px)] pr-[clamp(20px,3vw,32px)]"
            >
              <MediaSlot
                src={member.photoUrl}
                alt={member.name}
                label="Drop photo (no background)"
                aspectClassName="aspect-[3/4]"
                className="max-w-[260px]"
                fit="contain"
              />
              <div className="mt-4 font-serif text-xl font-bold leading-[1.15] tracking-[-0.02em]">
                {member.name}
              </div>
              <div className="mt-1.5 font-sans text-[11px] font-bold uppercase tracking-widest text-muted">
                {member.role}
              </div>
            </div>
          ))}
        </div>

        <div className="h-[clamp(24px,4vw,40px)]" />
      </Container>
    </div>
  );
}
