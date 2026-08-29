import { useDocumentTitle } from '../lib/useDocumentTitle';
import { Container } from '../components/layout/Container';
import { MediaSlot } from '../components/ui/MediaSlot';
import { TEAM } from '../lib/content';

export function TeamPage() {
  useDocumentTitle('Team — Siders');

  return (
    <div>
      <Container className="pt-[clamp(24px,4vw,44px)]">
        <div className="border-b-[3px] border-ink pb-3">
          <h1 className="font-serif text-[clamp(28px,4vw,44px)] font-bold uppercase tracking-[0.02em]">
            Behind The Siders
          </h1>
        </div>

        {TEAM.map((member) => (
          <div
            key={member.id}
            className="grid grid-cols-1 gap-[clamp(20px,3vw,40px)] border-b border-rule py-[clamp(24px,4vw,40px)] md:grid-cols-[260px_1fr]"
          >
            <div>
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

            {member.message && member.message.length > 0 && (
              <div className="font-serif text-[clamp(15px,1.6vw,18px)] leading-[1.7]">
                {member.message.map((block, index) => {
                  const spacingClassName = index > 0 ? 'mt-4' : '';
                  if (block.type === 'highlight') {
                    return (
                      <p
                        key={index}
                        className={`${spacingClassName} text-[clamp(19px,2.2vw,26px)] font-bold italic leading-[1.3]`}
                      >
                        {block.text}
                      </p>
                    );
                  }
                  if (block.type === 'tagline') {
                    return (
                      <div key={index} className={`${spacingClassName} font-sans`}>
                        {block.lines.map((line, lineIndex) => (
                          <div
                            key={lineIndex}
                            className="text-[13px] font-bold uppercase tracking-widest text-muted"
                          >
                            {line}
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <p key={index} className={spacingClassName}>
                      {block.text}
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="h-[clamp(24px,4vw,40px)]" />
      </Container>
    </div>
  );
}
