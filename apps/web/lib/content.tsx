/**
 * Static editorial content — copy, sub-brand identity, and placeholder assets that have no
 * backend model in this system (see `openspec/changes/add-web-news-pages/proposal.md` —
 * Non-Goals). Authored directly here, the same way a print masthead's own colophon is authored
 * rather than fetched.
 */

export interface NavItem {
  label: string;
  href: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/' },
  { label: 'News', href: '/news' },
  { label: 'Team', href: '/team' },
  { label: 'Contact', href: '/contact' },
];

export const EDITION = 'Edisi 01';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
}

export const TEAM: TeamMember[] = [
  { id: 'mikhael', name: 'Mikhael Jonathan', role: 'Founder' },
  { id: 'melvin', name: 'Melvin Tenggara', role: 'Comissioner' },
];

export const MANIFESTO = {
  headline: (
    <>
      EVERYONE HAS A VOICE.
      <br />
      EVERYONE HAS A STORY.
    </>
  ),
  subhead: 'EVERYONE IS',
  intro: [
    'Every person has a story waiting to be told, an idea waiting to be created, and a voice that deserves to be heard. These voices come together to build a community that is constantly evolving, inspiring, and creating impact.',
    'Siders is not built by one. It is built by everyone who shares the vision, contributes the creativity, and becomes part of the story. Four properties, two cities, one masthead — a group that publishes what its readers already talk about.',
    'From the weekly city guide to the community desk, everything Siders publishes starts from the same place: somebody had something to say, and nowhere to say it. This is that place, and it is open.',
  ],
};

export const STATS = [
  { value: '500+', label: 'Brands\nconnected' },
  { value: '450+', label: 'People\nengaged' },
  { value: '100.000.000+', label: 'Total\nviews' },
];

export const CONTACT_INFO = {
  address: ['Jalan Raya Darmo, Surabaya', 'Jawa Timur, Indonesia'],
  whatsapp: '+62 812 0000 0000',
  emails: ['karyasiders@gmail.com', 'partnership@siders.id'],
  mapQuery: 'Jalan Raya Darmo, Surabaya',
};

export const FOOTER_DESCRIPTION =
  'Kelompok media untuk Surabaya dan Jakarta. Empat properti, satu masthead — terbit tiap minggu.';

export const CTA_BAND = {
  headline: (
    <>
      Punya cerita, produk, atau kampanye?
      <br />
      Kirim ke redaksi.
    </>
  ),
};
