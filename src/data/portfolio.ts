/**
 * ---------------------------------------------------------------------------
 * PORTFOLIO CONTENT — SINGLE SOURCE OF TRUTH
 * ---------------------------------------------------------------------------
 * Every piece of personal information on the site lives in this file.
 * ---------------------------------------------------------------------------
 */

/* ------------------------- types ---------------------------------------- */

export interface NavLink {
  label: string
  id: string
}

export interface SocialLink {
  label: string
  href: string
  icon: 'github' | 'instagram' | 'linkedin' | 'x' | 'mail'
  handle: string
}

export interface SkillGroup {
  title: string
  caption: string
  skills: string[]
}

export interface LearningItem {
  name: string
  note: string
  progressLabel: string /** e.g. "Reading chapter 4" — plain text, no fake %. */
}

export interface ExperienceItem {
  period: string
  role: string
  org: string
  location: string
  summary: string
}

export interface EducationItem {
  period: string
  title: string
  org: string
  type: string
  note: string
}

export interface Project {
  id: string
  index: string
  title: string
  category: string
  year: string
  summary: string
  role: string
  stack: string[]
  /** Accent hue used by the card's generative artwork (HSL hue, 0–360). */
  hue: number
  /** If false, no live/source buttons are rendered — avoids broken links. */
  links?: {
    live?: string
    source?: string
  }
}

/* ------------------------- brand / identity ------------------------------ */

export const site = {
  /** Display name. */
  name: 'Tejas',
  /** Professional headline shown in the hero. */
  role: 'Computer Science & Engineering Student',
  /** Short hero intro sentence. */
  intro:
    'I build practical software, tools, and product-minded experiences that solve real problems.',
  /** Availability line in the hero. */
  availability: 'Open to internships, collaborations, and software roles',
  /** Contact email used by the footer mail link. */
  email: 'tejaskhadse900@gmail.com',
  /** One-line footer tagline. */
  tagline: 'Building software with clarity, curiosity, and purpose.',
} as const

export const profile = {
  avatar: '/shark-avatar.svg',
} as const

/* ------------------------- navigation ----------------------------------- */

export const navLinks: NavLink[] = [
  { label: 'About', id: 'about' },
  { label: 'Playground', id: 'playground' },
  { label: 'Projects', id: 'projects' },
  { label: 'Experience', id: 'experience' },
  { label: 'Learning', id: 'learning' },
  { label: 'Contact', id: 'contact' },
]

/* ------------------------- hero ----------------------------------------- */

export const hero = {
  /** Sub-status chip above the name. */
  eyebrow: 'Portfolio — full-stack developer in training',
  /** Big display statement — split so the accent word renders italic. */
  title: { plain: 'Full-stack', accent: 'builder' },
  /** Small paragraph under the statement (your professional headline). */
  subhead: 'Computer Science & Engineering Student',
  /** Smaller supporting sentence. */
  lead:
    'I am a Computer Science and Engineering student passionate about full-stack web development, frontend engineering, backend architecture, REST APIs, database design, and interactive Three.js experiences.',
  /** Caption for the 3D scene, shown as a hint. */
  sceneHint: 'The scene reacts to your cursor — drag anywhere to spin it.',
  scrollCta: 'Scroll to explore',
}

/* ------------------------- about ---------------------------------------- */

export const about = {
  heading: 'Who is behind this site.',
  /** 1–3 short paragraphs. */
  paragraphs: [
    'I am a Computer Science & Engineering student pursuing B.E. Computer Science and Engineering (2023–2027). I am developing a strong foundation in software engineering, product thinking, and practical systems design.',
    'My interests span full-stack web development, frontend engineering, backend architecture, REST APIs, database design, React and Next.js, Node.js and Express.js, Python and Go, TypeScript, Docker, cloud technologies, and interactive Three.js experiences. I enjoy turning ideas into working products and learning by building experiences that are useful, scalable, and thoughtfully designed.',
  ],
  /** Quick facts shown as a definition list. */
  facts: [
    { label: 'Currently', value: 'B.E. Computer Science and Engineering (2023–2027)' },
    { label: 'Focus', value: 'Full-stack product development • APIs • frontend + backend' },
  ],
} as const

/* ------------------------- skills --------------------------------------- */

export const skills = {
  heading: 'What I work with.',
  lead: 'A focused set of tools I use to ship software, experiments, and practical products across different layers of the stack.',
  groups: [
    {
      title: 'Languages',
      caption: 'Core programming languages I work with.',
      skills: ['Python', 'C++', 'JavaScript', 'TypeScript'],
    },
    {
      title: 'Frameworks',
      caption: 'Libraries and frameworks I use to build and ship products.',
      skills: ['Next.js', 'React', 'React Native', 'Node.js', 'Express.js', 'Tailwind CSS'],
    },
    {
      title: 'Databases',
      caption: 'Data layers I have worked with in projects and prototypes.',
      skills: ['PostgreSQL', 'Firebase', 'MongoDB', 'Redis'],
    },
    {
      title: 'Tools',
      caption: 'Development and deployment tools I rely on.',
      skills: ['Git', 'Docker', 'AWS', 'Vercel AI SDK'],
    },
  ] satisfies SkillGroup[],
} as const

/* ------------------------- learning (Phase 5) ---------------------------- */

export const learning = {
  heading: 'Currently learning.',
  lead: 'A few areas I am actively improving with hands-on focus and practical feedback.',
  items: [
    {
      name: 'System design fundamentals',
      note: 'Deepening my understanding of scaling, architecture trade-offs, and reliable software design patterns.',
      progressLabel: 'In progress — building mental models for real-world systems.',
    },
    {
      name: 'Advanced JavaScript and TypeScript',
      note: 'Refining abstraction, better APIs, cleaner state handling, and more production-ready frontend patterns.',
      progressLabel: 'In progress — improving practical patterns and code quality.',
    },
  ] satisfies LearningItem[],
} as const

/* ------------------------- experience (Phase 5) -------------------------- */

export const experience = {
  heading: "Where I've been.",
  lead: 'My learning and build journey, shaped by hands-on software work and a growing product mindset.',
  items: [
    {
      period: '2023 — 2027',
      role: 'Computer Science & Engineering Student',
      org: 'B.E. Computer Science and Engineering',
      location: 'Remote / collaborative',
      summary:
        'Focused on software engineering fundamentals, practical project work, and building systems that combine usability, reliability, and thoughtful design.',
    },
  ] satisfies ExperienceItem[],
} as const

/* ------------------------- education (Phase 5) --------------------------- */

export const education = {
  heading: 'Education.',
  items: [
    {
      period: '2023 — 2027',
      title: 'B.E. Computer Science and Engineering',
      org: 'Computer Science & Engineering',
      type: 'Degree',
      note: 'Studying core computer science foundations, engineering principles, and practical software development through coursework and real projects.',
    },
  ] satisfies EducationItem[],
} as const

/* ------------------------- projects (Phase 4) ---------------------------- */

export const projects = {
  heading: 'Selected work.',
  lead: 'A few practical builds that reflect my focus on useful tooling, clean engineering, and product-minded problem solving.',
  items: [
    {
      id: 'screen-time-tracker',
      index: '01',
      title: 'Screen Time and App Usage Tracker',
      category: 'Desktop app',
      year: 'January 2026',
      summary:
        'Cross-platform offline application with active window detection, idle tracking, session management, JSON storage and usage reports.',
      role: 'Solo build',
      stack: ['Python', 'JSON'],
      hue: 142,
    },
    {
      id: 'gix-cli',
      index: '02',
      title: 'Gix – Git-like CLI Tool',
      category: 'CLI tool',
      year: 'April 2026',
      summary:
        'Lightweight version control CLI with repository initialization, staging, commits, history and diff viewer.',
      role: 'Solo build',
      stack: ['Node.js', 'JavaScript'],
      hue: 36,
    },
    {
      id: 'aetherlink',
      index: '03',
      title: 'AetherLink – Secure File Transfer System',
      category: 'Full-stack platform',
      year: 'January 2026',
      summary:
        'Secure file transfer platform with chunked uploads, automatic resume/retry, P2P support, Share ID authentication, xxHash integrity validation and SSE progress tracking.',
      role: 'Solo build',
      stack: ['Go', 'Next.js', 'React', 'TypeScript'],
      hue: 205,
    },
  ] satisfies Project[],
} as const

/* ------------------------- socials (Phase 6) ----------------------------- */

export const socials: SocialLink[] = [
  {
    label: 'GitHub',
    href: 'https://github.com/talash88',
    icon: 'github',
    handle: '@talash88',
  },
  {
    label: 'Instagram',
    href: 'https://www.instagram.com/_tejas_khadse/',
    icon: 'instagram',
    handle: '@_tejas_khadse',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/tejas-khadse-7a5187250/',
    icon: 'linkedin',
    handle: '/in/tejas-khadse-7a5187250',
  },
  {
    label: 'X',
    href: 'https://x.com/TEJASKHADS63147',
    icon: 'x',
    handle: '@TEJASKHADS63147',
  },
]

/* ------------------------- contact (Phase 6) ----------------------------- */

export const contact = {
  heading: 'Get in touch.',
  intro: 'I am open to internships, collaborations, and thoughtful product or engineering conversations. If you have a project, idea, or opportunity to build something useful, I would love to hear about it.',
  formNote: 'Your message is sent securely and only after validation by the email provider.',
}

/* ------------------------- meta & footer (Phase 6) ----------------------- */

export const meta = {
  /** Browser tab / SEO title. */
  title: 'Tejas — Developer Portfolio',
  description:
    'Personal portfolio of a Computer Science & Engineering student building practical software, full-stack products, and developer tools.',
}

export const footer = {
  configNotice: 'Portfolio details are configured in src/data/portfolio.ts.',
  buildNote: 'Built with React, TypeScript & Three.js.',
} as const

export const community = {
  name: 'Developer Community',
  description: 'A single shared group for builders, students, and developers to discuss ideas, collaborate, and stay connected.',
  welcome: 'Join the community to share project updates, ask questions, and connect with others building in tech.',
} as const
