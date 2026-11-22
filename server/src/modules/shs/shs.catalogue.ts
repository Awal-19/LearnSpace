import type { PrismaClient } from '@prisma/client';

export const SHS_SYLLABUS_SOURCE =
  'NaCCA / GES Senior High School Curriculum Framework (nacca.gov.gh)';

export interface PresetProgramme {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface PresetSubject {
  slug: string;
  name: string;
  code: string;
  isCore: boolean;
  programmeSlugs: string[];
  topics: Array<{ title: string; schoolYear?: string }>;
}

export const PRESET_SHS_PROGRAMMES: readonly PresetProgramme[] = [
  {
    slug: 'general-science',
    name: 'General Science',
    description: 'STEM pathway covering Physics, Chemistry, Biology, and Additional Mathematics.',
    sortOrder: 1,
  },
  {
    slug: 'general-arts',
    name: 'General Arts',
    description: 'Humanities, Social Sciences, Languages, Literature, and Governance.',
    sortOrder: 2,
  },
  {
    slug: 'business',
    name: 'Business',
    description: 'Accounting, Business Management, Economics, and Costing.',
    sortOrder: 3,
  },
  {
    slug: 'visual-arts',
    name: 'Visual Arts',
    description:
      'Design, Studio Practice, Graphic Design, Picture Making, Textiles, and Sculpture.',
    sortOrder: 4,
  },
  {
    slug: 'home-economics',
    name: 'Home Economics',
    description: 'Food and Nutrition, Management in Living, and Clothing & Textiles.',
    sortOrder: 5,
  },
  {
    slug: 'agricultural-science',
    name: 'Agricultural Science',
    description: 'General Agriculture, Crop Husbandry, Animal Husbandry, and Agribusiness.',
    sortOrder: 6,
  },
  {
    slug: 'technical',
    name: 'Technical / Applied Technology',
    description:
      'Engineering Science, Design & Communication Technology, Electronics, and Construction.',
    sortOrder: 7,
  },
];

export const PRESET_SHS_SUBJECTS: readonly PresetSubject[] = [
  // Core Subjects (NaCCA / GES)
  {
    slug: 'english-language',
    name: 'English Language',
    code: 'ENG',
    isCore: true,
    programmeSlugs: [],
    topics: [
      { title: 'Reading Comprehension & Summary Writing', schoolYear: 'SHS 1' },
      { title: 'Grammar: Parts of Speech, Tenses & Concord', schoolYear: 'SHS 1' },
      { title: 'Essay Writing: Narrative, Descriptive & Expository', schoolYear: 'SHS 2' },
      { title: 'Formal & Informal Letters, Articles & Speeches', schoolYear: 'SHS 2' },
      { title: 'Oral English: Vowel & Consonant Sounds, Stress & Intonation', schoolYear: 'SHS 3' },
      { title: 'Argumentative Writing & Literary Appreciation', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'core-mathematics',
    name: 'Core Mathematics',
    code: 'MATH',
    isCore: true,
    programmeSlugs: [],
    topics: [
      { title: 'Sets, Number Bases & Real Number System', schoolYear: 'SHS 1' },
      { title: 'Algebraic Expressions, Linear Equations & Inequalities', schoolYear: 'SHS 1' },
      { title: 'Plane Geometry, Mensuration & Circle Theorems', schoolYear: 'SHS 2' },
      { title: 'Quadratic Functions, Indices & Logarithms', schoolYear: 'SHS 2' },
      { title: 'Trigonometry & Bearings', schoolYear: 'SHS 2' },
      { title: 'Statistics, Probability & Vectors', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'integrated-science',
    name: 'Integrated Science (General Science)',
    code: 'SCI',
    isCore: true,
    programmeSlugs: [],
    topics: [
      { title: 'Measurement, Scientific Method & Matter', schoolYear: 'SHS 1' },
      { title: 'Cell Structure, Diffusion, Osmosis & Classification', schoolYear: 'SHS 1' },
      { title: 'Acids, Bases, Salts & Chemical Bonding', schoolYear: 'SHS 2' },
      { title: 'Force, Motion, Energy, Electricity & Magnetism', schoolYear: 'SHS 2' },
      { title: 'Human Systems, Genetics & Ecology', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'social-studies',
    name: 'Social Studies',
    code: 'SOC',
    isCore: true,
    programmeSlugs: [],
    topics: [
      { title: 'Self-Identity, Adolescent Reproductive Health & Family', schoolYear: 'SHS 1' },
      { title: 'Our Physical Environment & Environmental Challenges', schoolYear: 'SHS 1' },
      { title: 'Constitution, Democracy & Nation Building in Ghana', schoolYear: 'SHS 2' },
      { title: 'Leadership, Followership & Rights and Responsibilities', schoolYear: 'SHS 2' },
      { title: 'Sustainable Development, Entrepreneurship & Globalization', schoolYear: 'SHS 3' },
    ],
  },
  // Electives
  {
    slug: 'physics',
    name: 'Physics',
    code: 'PHY',
    isCore: false,
    programmeSlugs: ['general-science', 'technical'],
    topics: [
      { title: 'Kinematics, Projectile Motion & Newtons Laws', schoolYear: 'SHS 1' },
      { title: 'Work, Energy, Power & Linear Momentum', schoolYear: 'SHS 1' },
      { title: 'Waves, Optics & Sound', schoolYear: 'SHS 2' },
      { title: 'Electrostatics, Current Electricity & Circuits', schoolYear: 'SHS 2' },
      { title: 'Electromagnetism & Atomic/Nuclear Physics', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'chemistry',
    name: 'Chemistry',
    code: 'CHEM',
    isCore: false,
    programmeSlugs: ['general-science', 'agricultural-science', 'home-economics'],
    topics: [
      { title: 'Atomic Structure, Periodicity & Chemical Bonding', schoolYear: 'SHS 1' },
      { title: 'Stoichiometry, Mole Concept & Gas Laws', schoolYear: 'SHS 1' },
      { title: 'Chemical Equilibrium, Acids, Bases & Redox Reactions', schoolYear: 'SHS 2' },
      { title: 'Thermochemistry & Reaction Kinetics', schoolYear: 'SHS 2' },
      { title: 'Organic Chemistry: Hydrocarbons & Functional Groups', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'biology',
    name: 'Biology',
    code: 'BIO',
    isCore: false,
    programmeSlugs: ['general-science', 'agricultural-science', 'home-economics'],
    topics: [
      { title: 'Cell Biology, Enzymes & Nutrition', schoolYear: 'SHS 1' },
      { title: 'Transport in Plants & Animals, Respiration', schoolYear: 'SHS 2' },
      { title: 'Excretion, Homeostasis & Nervous Coordination', schoolYear: 'SHS 2' },
      { title: 'Genetics, Variation & Evolution', schoolYear: 'SHS 3' },
      { title: 'Ecology & Conservation', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'elective-mathematics',
    name: 'Elective / Additional Mathematics',
    code: 'EMATH',
    isCore: false,
    programmeSlugs: ['general-science', 'business', 'technical'],
    topics: [
      { title: 'Polynomials, Surds, Logarithms & Sequences', schoolYear: 'SHS 1' },
      { title: 'Coordinate Geometry, Vectors & Matrices', schoolYear: 'SHS 2' },
      { title: 'Differential & Integral Calculus', schoolYear: 'SHS 2' },
      { title: 'Trigonometric Identities & Equations', schoolYear: 'SHS 2' },
      { title: 'Permutations, Combinations, Probability & Mechanics', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'computing',
    name: 'Computing / ICT',
    code: 'ICT',
    isCore: false,
    programmeSlugs: ['general-science', 'business', 'general-arts', 'technical'],
    topics: [
      { title: 'Computer Systems, Hardware & Operating Systems', schoolYear: 'SHS 1' },
      { title: 'Algorithms, Flowcharts & Introductory Programming', schoolYear: 'SHS 2' },
      { title: 'Databases, Spreadsheets & Networking', schoolYear: 'SHS 2' },
      { title: 'Cybersecurity, Ethics & Web Fundamentals', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'economics',
    name: 'Economics',
    code: 'ECON',
    isCore: false,
    programmeSlugs: ['business', 'general-arts', 'agricultural-science'],
    topics: [
      { title: 'Scarcity, Choice, Opportunity Cost & Production', schoolYear: 'SHS 1' },
      { title: 'Demand, Supply, Elasticity & Market Equilibrium', schoolYear: 'SHS 1' },
      { title: 'Theory of Consumer Behaviour & Cost of Production', schoolYear: 'SHS 2' },
      { title: 'National Income, Money, Banking & Inflation', schoolYear: 'SHS 2' },
      { title: 'International Trade, Economic Growth & Development', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'financial-accounting',
    name: 'Financial Accounting',
    code: 'ACCT',
    isCore: false,
    programmeSlugs: ['business'],
    topics: [
      {
        title: 'Accounting Concepts, Source Documents & Books of Original Entry',
        schoolYear: 'SHS 1',
      },
      { title: 'Double Entry, Trial Balance & Bank Reconciliation', schoolYear: 'SHS 1' },
      { title: 'Final Accounts of Sole Traders & Adjustments', schoolYear: 'SHS 2' },
      { title: 'Partnership Accounts & Company Accounts', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'business-management',
    name: 'Business Management',
    code: 'BMGT',
    isCore: false,
    programmeSlugs: ['business'],
    topics: [
      { title: 'Nature of Management & Business Environment', schoolYear: 'SHS 1' },
      { title: 'Forms of Business Ownership & Entrepreneurship', schoolYear: 'SHS 1' },
      { title: 'Marketing, Human Resource & Operations Management', schoolYear: 'SHS 2' },
      { title: 'Business Finance, Ethics & International Business', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'literature-in-english',
    name: 'Literature-in-English',
    code: 'LIT',
    isCore: false,
    programmeSlugs: ['general-arts'],
    topics: [
      { title: 'Literary Devices, Genres & Unseen Prose/Poetry', schoolYear: 'SHS 1' },
      { title: 'African & Non-African Drama Analysis', schoolYear: 'SHS 2' },
      { title: 'African & Non-African Prose & Poetry', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'government',
    name: 'Government',
    code: 'GOVT',
    isCore: false,
    programmeSlugs: ['general-arts'],
    topics: [
      { title: 'Basic Concepts of Government & Political Ideologies', schoolYear: 'SHS 1' },
      { title: 'Constitutions, Separation of Powers & Rule of Law', schoolYear: 'SHS 2' },
      {
        title: 'Pre-Colonial, Colonial & Post-Independence Politics in West Africa',
        schoolYear: 'SHS 3',
      },
    ],
  },
  {
    slug: 'geography',
    name: 'Geography',
    code: 'GEOG',
    isCore: false,
    programmeSlugs: ['general-arts', 'general-science'],
    topics: [
      { title: 'Map Reading, Scale & Relief Representation', schoolYear: 'SHS 1' },
      { title: 'Weather, Climate, Rocks & Landforms', schoolYear: 'SHS 2' },
      { title: 'Population, Settlement & Economic Geography of Ghana', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'history',
    name: 'History',
    code: 'HIST',
    isCore: false,
    programmeSlugs: ['general-arts'],
    topics: [
      { title: 'Sources of History & Early States of Ghana', schoolYear: 'SHS 1' },
      { title: 'Trans-Saharan Trade, European Contact & Colonial Rule', schoolYear: 'SHS 2' },
      { title: 'Nationalism, Independence & Post-Independence Ghana', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'food-and-nutrition',
    name: 'Food and Nutrition',
    code: 'FN',
    isCore: false,
    programmeSlugs: ['home-economics'],
    topics: [
      { title: 'Nutrients, Balanced Diets & Meal Planning', schoolYear: 'SHS 1' },
      { title: 'Food Hygiene, Safety & Preservation', schoolYear: 'SHS 2' },
      { title: 'Methods of Cooking & Special Dietary Needs', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'general-agriculture',
    name: 'General Agriculture',
    code: 'AGRIC',
    isCore: false,
    programmeSlugs: ['agricultural-science'],
    topics: [
      { title: 'Soil Science, Soil Fertility & Conservation', schoolYear: 'SHS 1' },
      { title: 'Crop Production, Pests & Disease Control', schoolYear: 'SHS 2' },
      { title: 'Animal Production, Farm Mechanization & Agribusiness', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'graphic-design',
    name: 'Graphic Design',
    code: 'GDES',
    isCore: false,
    programmeSlugs: ['visual-arts'],
    topics: [
      { title: 'Elements & Principles of Design, Typography', schoolYear: 'SHS 1' },
      { title: 'Layout, Poster Design, Branding & Packaging', schoolYear: 'SHS 2' },
      { title: 'Printmaking & Digital Visual Communication', schoolYear: 'SHS 3' },
    ],
  },
  {
    slug: 'applied-technology',
    name: 'Applied Technology / Design & Communication Technology',
    code: 'TECH',
    isCore: false,
    programmeSlugs: ['technical'],
    topics: [
      { title: 'Technical Drawing, Orthographic & Isometric Projection', schoolYear: 'SHS 1' },
      { title: 'Workshop Safety, Materials & Basic Electronics', schoolYear: 'SHS 2' },
      { title: 'Engineering Design Process & Fabrication', schoolYear: 'SHS 3' },
    ],
  },
];

let seededOnce = false;

export async function ensureShsCatalogueSeeded(prisma: PrismaClient): Promise<void> {
  if (seededOnce) return;
  const count = await prisma.shsProgramme.count().catch(() => 0);
  if (count > 0) {
    seededOnce = true;
    return;
  }

  for (const prog of PRESET_SHS_PROGRAMMES) {
    await prisma.shsProgramme.upsert({
      where: { slug: prog.slug },
      create: {
        slug: prog.slug,
        name: prog.name,
        description: prog.description,
        sortOrder: prog.sortOrder,
        active: true,
      },
      update: {},
    });
  }

  for (const subj of PRESET_SHS_SUBJECTS) {
    const created = await prisma.subjectCatalogue.upsert({
      where: { slug: subj.slug },
      create: {
        slug: subj.slug,
        name: subj.name,
        code: subj.code,
        isCore: subj.isCore,
        programmeSlugs: subj.programmeSlugs,
        syllabusVersion: 'NaCCA-2024',
        sourceCitation: SHS_SYLLABUS_SOURCE,
        active: true,
      },
      update: {},
    });

    for (let i = 0; i < subj.topics.length; i += 1) {
      const t = subj.topics[i]!;
      await prisma.subjectTopic.upsert({
        where: { subjectId_title: { subjectId: created.id, title: t.title } },
        create: {
          subjectId: created.id,
          title: t.title,
          schoolYear: t.schoolYear ?? null,
          sortOrder: i + 1,
          active: true,
        },
        update: {},
      });
    }
  }
  seededOnce = true;
}
