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

/** One block of a team member's statement — `highlight` is a standalone declaration pulled out
 *  of the prose (e.g. a tagline sentence), `tagline` is the short stacked closing lines some
 *  statements end with. Plain prose is `p`. */
export type TeamMessageBlock =
  | { type: 'p'; text: string }
  | { type: 'highlight'; text: string }
  | { type: 'tagline'; lines: string[] };

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  photoUrl: string | null;
  message?: TeamMessageBlock[];
}

export const TEAM: TeamMember[] = [
  {
    id: 'mikhael',
    name: 'Mikhael Jonathan',
    role: 'Founder, Siders Media',
    photoUrl: '/team/mikhael.jpg',
    message: [
      {
        type: 'p',
        text: 'Saya percaya bahwa media yang relevan bukan hanya tentang bagaimana sebuah cerita disampaikan, tetapi tentang bagaimana sebuah cerita mampu menghubungkan manusia di dalamnya.',
      },
      {
        type: 'p',
        text: 'Siders dibangun sebagai hyperlocal media and community, sebuah media yang tumbuh dari kedekatan dengan masyarakat, memahami dinamika lokal, dan membuka ruang bagi siapa pun untuk ikut menjadi bagian dari percakapan.',
      },
      { type: 'p', text: 'Kami tidak ingin menempatkan masyarakat hanya sebagai audience.' },
      {
        type: 'p',
        text: 'Di Siders, setiap orang memiliki kesempatan untuk berinteraksi, berbagi perspektif, menemukan informasi, memperkenalkan karya, membangun koneksi, maupun menciptakan peluang.',
      },
      { type: 'p', text: 'Karena itu, kami membawa satu prinsip sederhana:' },
      { type: 'highlight', text: 'Everyone is Siders.' },
      {
        type: 'p',
        text: 'Siders adalah wadah yang mempertemukan cerita, informasi, komunitas, bisnis, brand, kreator, dan berbagai kebutuhan masyarakat dalam satu ekosistem yang terus berkembang.',
      },
      {
        type: 'p',
        text: 'Hari ini, kami membangun koneksi tersebut melalui media dan platform digital. Ke depan, kami ingin membawanya lebih jauh melalui komunitas, kolaborasi, activation, dan berbagai pengalaman offline yang mempertemukan masyarakat secara langsung.',
      },
      {
        type: 'p',
        text: 'Bagi saya, masa depan media bukan hanya tentang menjadi sumber informasi, tetapi tentang menjadi bagian dari kehidupan masyarakat yang dilayaninya.',
      },
      { type: 'p', text: 'Dan Siders ingin tumbuh bersama masyarakat itu sendiri.' },
      { type: 'tagline', lines: ['Hyperlocal by nature.', 'Community by heart.', 'Media at our core.'] },
    ],
  },
  {
    id: 'melvin',
    name: 'Melvin Tenggara',
    role: 'Investor & Strategic Partner, Siders Media',
    photoUrl: '/team/melvin.jpg',
    message: [
      {
        type: 'p',
        text: 'Saya melihat Siders bukan sekadar sebagai media, tetapi sebagai sebuah ekosistem yang memiliki kedekatan nyata dengan masyarakat.',
      },
      {
        type: 'p',
        text: 'Potensinya terletak pada kemampuan Siders untuk menghubungkan informasi, komunitas, bisnis, dan berbagai peluang dalam satu ruang yang relevan dan terus berkembang.',
      },
      {
        type: 'p',
        text: 'Bagi saya, menjadi bagian dari Siders adalah kesempatan untuk ikut membangun sesuatu yang tidak hanya memiliki nilai bisnis, tetapi juga memberikan dampak bagi ekosistem lokal.',
      },
    ],
  },
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
  {
    name: 'SidersVox',
    kind: 'News & Community',
    tile: 'transparent',
    tileInk: '#F7F6F2',
    logo: `${import.meta.env.BASE_URL}siders-vox-bulat.png`,
  },
  {
    name: 'Surabaya Siders',
    kind: 'Media Platform',
    tile: 'transparent',
    tileInk: '#141414',
    logo: `${import.meta.env.BASE_URL}surabaya-siders-bulat.png`,
  },
  {
    name: 'Jakarta Siders',
    kind: 'Media Platform',
    tile: 'transparent',
    tileInk: '#F7F6F2',
    logo: `${import.meta.env.BASE_URL}jakarta-siders-bulat.png`,
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
