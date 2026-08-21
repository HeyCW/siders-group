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

export interface SubBrandLink {
  label: string;
  href: string;
}

export interface SubBrand {
  name: string;
  kind: string;
  tile: string;
  tileInk: string;
  logo: string;
  /** Not every sub-brand has approved copy yet — omitted rather than faked (`SUB_BRANDS` below). */
  desc?: string;
  links?: SubBrandLink[];
}

/** Matches the approved design exactly (`Siders Broadsheet.dc.html` — `subBrands`). */
export const SUB_BRANDS: SubBrand[] = [
  {
    name: 'SidersVox',
    kind: 'News & Community',
    tile: '#000000',
    tileInk: '#F7F6F2',
    logo: '/siders_vos.png',
    desc: 'Platform media yang menghadirkan perspektif, opini, dan cerita dari suara generasi muda. Membahas isu sosial, lifestyle, hingga topik yang dekat dengan kehidupan sehari-hari.',
    links: [{ label: 'Instagram', href: 'https://www.instagram.com/sidersvox?igsh=NXFqZGF2MG1kYTk5' }],
  },
  {
    name: 'Surabaya Siders',
    kind: 'Media Platform',
    tile: '#FFFFFF',
    tileInk: '#141414',
    logo: '/surabaya_siders.png',
    desc: 'Media lokal yang mengangkat berbagai cerita dan perkembangan seputar Surabaya, mulai dari kuliner, lifestyle, tempat menarik, hingga tren yang sedang ramai di kota.',
    links: [
      { label: 'Instagram', href: 'https://www.instagram.com/surabayasiders?igsh=MXNxdXB2N2N4N2th' },
      { label: 'TikTok', href: 'https://www.tiktok.com/@surabaya.siders?_r=1&_t=ZS-992Gnls45US' },
    ],
  },
  {
    name: 'Jakarta Siders',
    kind: 'Media Platform',
    tile: '#000000',
    tileInk: '#F7F6F2',
    logo: '/jakarta_siders.png',
    desc: 'Media yang mengeksplorasi kehidupan dan dinamika Jakarta, dari lifestyle, kuliner, entertainment, sampai berbagai tren dan tempat menarik yang sedang jadi perhatian.',
    links: [
      { label: 'Instagram', href: 'https://www.instagram.com/jakarta_siders?igsh=NGRpNWQ2bXBtanFz' },
      { label: 'TikTok', href: 'https://www.tiktok.com/@jakartasiders?_r=1&_t=ZS-992GpEooN0f' },
    ],
  },
  {
    name: 'Siders Culture',
    kind: 'News & Community',
    tile: '#FFFFFF',
    tileInk: '#141414',
    logo: '/siders_culture.png',
  },
];

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
