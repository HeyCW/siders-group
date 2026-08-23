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
  { label: 'Hyperlocal News', href: '/news' },
  { label: 'Behind The Siders', href: '/team' },
  { label: 'Contact', href: '/contact' },
];

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
}

export const TEAM: TeamMember[] = [
  { id: 'mikhael', name: 'Mikhael Jonathan', role: 'Founder', photoUrl: '/team/mikhael.png' },
  { id: 'melvin', name: 'Melvin Tenggara', role: 'Comissioner', photoUrl: '/team/melvin.jpeg' },
];

export interface SubBrand {
  name: string;
  kind: 'Media Platform' | 'News & Community';
  tile: string;
  tileInk: string;
  /** `null` where no local logo image exists yet — renders the name as text instead
   *  (`ConnectedPlatforms.tsx`). */
  logo: string | null;
}

/** The masthead logo row's data — hardcoded rather than pulled from the anak usaha DB profile
 *  (that data drives `AnakUsahaTiles.tsx` further down the page instead), so this row never
 *  changes just because an admin edits a profile. */
export const SUB_BRANDS: SubBrand[] = [
  { name: 'SidersVox', kind: 'News & Community', tile: '#000000', tileInk: '#F7F6F2', logo: '/siders_voX.png' },
  {
    name: 'Surabaya Siders',
    kind: 'Media Platform',
    tile: 'transparent',
    tileInk: '#141414',
    logo: '/surabay-siders-bulat.jpg',
  },
  {
    name: 'Jakarta Siders',
    kind: 'Media Platform',
    tile: 'transparent',
    tileInk: '#F7F6F2',
    logo: '/jakarta-siders-bulat.jpg',
  },
  {
    name: 'Siders Culture',
    kind: 'News & Community',
    tile: '#FFFFFF',
    tileInk: '#141414',
    logo: '/siders_culture.png',
  },
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
    'Siders is not built by one. It is built by everyone who shares the vision, contributes the creativity, and becomes part of the story.',
  ],
};

export const STATS = [
  { value: '500+', label: 'Brands\nconnected' },
  { value: '450+', label: 'People\nengaged' },
  { value: '100.000.000+', label: 'Total\nviews' },
];

export const CONTACT_INFO = {
  whatsapp: 'Vania (0812-1737-1521)',
  whatsappNumber: '6281217371521',
  emails: ['karyasiders@gmail.com'],
};

export const FOOTER_DESCRIPTION = 'We Are All Siders! Ready to Explore?';

export const CTA_BAND = {
  headline: (
    <>
      Punya cerita, produk, atau kampanye?
      <br />
      Hubungi aja.
    </>
  ),
};
