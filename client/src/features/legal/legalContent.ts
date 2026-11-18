export type LegalDocumentKind = 'terms' | 'privacy';

export interface LegalSection {
  id: string;
  number: number;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  callout?: {
    title: string;
    body: string;
  };
}

export interface LegalDocumentData {
  kind: LegalDocumentKind;
  title: string;
  route: '/terms-and-conditions' | '/privacy-policy';
  subtitle: string;
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  draftNotice: string;
  sections: readonly LegalSection[];
}

export const LEGAL_VERSION = '2026-11-18';
export const LEGAL_EFFECTIVE_DATE = 'November 18, 2026';
export const LEGAL_LAST_UPDATED = 'November 18, 2026';

export const LEGAL_DRAFT_NOTICE =
  'Draft Notice: This document is an editable platform draft prepared for review before commercial production release and has not been reviewed by qualified legal counsel. Bracketed items mark operator, jurisdictional, and contact details to be completed prior to production launch.';

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    id: 'introduction',
    number: 1,
    title: 'Introduction',
    paragraphs: [
      'Welcome to LearnSpace. LearnSpace is an AI-assisted educational workspace designed to help students organize courses, take structured notes, review uploaded study materials, plan tasks, track focus sessions, practice with flashcards and quizzes, and converse with an AI study assistant.',
      'These Terms and Conditions ("Terms") govern your access to and use of the LearnSpace web application, APIs, and related learning tools ("Service") operated by [LearnSpace Operating Entity — To Be Designated Prior to Production].',
    ],
  },
  {
    id: 'acceptance-of-terms',
    number: 2,
    title: 'Acceptance of Terms',
    paragraphs: [
      'By creating an account, checking the acceptance box during registration, or otherwise accessing or using LearnSpace, you confirm that you have read, understood, and agree to be bound by these Terms and by our Privacy Policy.',
      'When you register with an email address and password, LearnSpace records your explicit acceptance status along with the document version and acceptance timestamp in our database. If you do not agree to these Terms and the Privacy Policy, you may not register an account or use the Service.',
    ],
  },
  {
    id: 'eligibility-and-user-accounts',
    number: 3,
    title: 'Eligibility and User Accounts',
    paragraphs: [
      'You must provide accurate, complete registration information (including your full name and a valid email address) and be legally permitted to enter into an online service agreement under the laws applicable where you reside.',
      'If you are under the age required to consent independently to online services in your jurisdiction, you may only use LearnSpace with the permission and supervision of a parent, legal guardian, or authorized educational institution. Access to workspace features requires completing account verification according to LearnSpace authentication rules (including email one-time verification codes for email/password sign-ups).',
    ],
  },
  {
    id: 'account-responsibilities',
    number: 4,
    title: 'Account Responsibilities',
    paragraphs: [
      'You are responsible for safeguarding your account password and maintaining the confidentiality of your authentication credentials and active sessions.',
    ],
    bullets: [
      'Choose a strong, unique password that meets LearnSpace password requirements and avoid sharing your credentials with others.',
      'Keep your profile details, academic metadata, and contact email accurate and up to date.',
      'Notify the platform administrator promptly if you suspect unauthorized access to or compromise of your account.',
      'Accept responsibility for activities performed through your authenticated session unless unauthorized access occurred through no fault of your own.',
    ],
  },
  {
    id: 'acceptable-use',
    number: 5,
    title: 'Acceptable Use',
    paragraphs: [
      'You agree to use LearnSpace lawfully, ethically, and solely for legitimate educational, study, and personal productivity purposes. You must not:',
    ],
    bullets: [
      'Upload, generate, or transmit unlawful, abusive, defamatory, harassing, malicious, or infringing content.',
      'Attempt to bypass authentication gates, verification checks, rate limits, CSRF protections, or access controls belonging to other users or administrative tools.',
      'Probe, scrape, disrupt, overload, or interfere with LearnSpace servers, APIs, databases, or third-party AI and storage providers.',
      'Use AI-generated outputs to violate academic integrity policies, examination rules, or honor codes set by your school, college, or university.',
    ],
  },
  {
    id: 'ai-assistant-and-ai-generated-content',
    number: 6,
    title: 'AI Assistant and AI-Generated Content',
    paragraphs: [
      'LearnSpace provides conversational AI assistance, explanation tools, flashcards, and practice quiz generation powered by external language and vision models. Because generative AI models operate probabilistically, responses may be incomplete, outdated, biased, or factually incorrect.',
      'AI-generated content is provided strictly as a supplementary study aid and must not be relied upon as authoritative academic grading, medical, legal, financial, or safety-critical advice. Always verify important formulas, definitions, citations, and exam facts against your official course materials and instructors.',
    ],
    callout: {
      title: 'Important AI Accuracy Notice',
      body: 'Do not enter highly sensitive personal identification numbers, financial credentials, or confidential clinical records into AI chat prompts.',
    },
  },
  {
    id: 'uploaded-documents-and-study-materials',
    number: 7,
    title: 'Uploaded Documents and Study Materials',
    paragraphs: [
      'When you upload documents, slides, or images to LearnSpace (including PDF, DOCX, PPTX, TXT, MD, or image attachments), you represent that you own the material or have the necessary permissions to store and process it for your personal study workspace.',
      'To deliver study features such as previews, text extraction, question-answering context, flashcards, and quizzes, LearnSpace parses uploaded files, extracts text chunks for indexing, and may store files in PostgreSQL or an external object storage provider when configured. You remain solely responsible for compliance with copyright and institutional sharing rules for uploaded files.',
    ],
  },
  {
    id: 'intellectual-property',
    number: 8,
    title: 'Intellectual Property',
    paragraphs: [
      'All LearnSpace software source code, interface designs, visual branding, icons, and platform documentation remain the property of [LearnSpace Operating Entity — To Be Designated Prior to Production] or its licensors.',
      'You retain ownership of original notes, flashcards, profile images, and study materials you create or lawfully upload to your workspace. By submitting content through LearnSpace, you grant LearnSpace a limited, non-exclusive license to host, process, index, format, and display that content strictly as necessary to operate, secure, and deliver the Service to you.',
    ],
  },
  {
    id: 'privacy-and-personal-data',
    number: 9,
    title: 'Privacy and Personal Data',
    paragraphs: [
      'Your privacy matters to us. Our Privacy Policy explains what information LearnSpace collects during registration, authentication, study workspace usage, profile customization, document uploads, and AI interactions, as well as the safeguards and user controls available.',
      'By accepting these Terms, you acknowledge that personal data is processed as described in the Privacy Policy (/privacy-policy).',
    ],
  },
  {
    id: 'service-availability',
    number: 10,
    title: 'Service Availability',
    paragraphs: [
      'We aim to keep LearnSpace reliable and responsive, but we cannot guarantee uninterrupted, error-free, or permanently available access. Features may undergo updates, scheduled maintenance, configuration adjustments (such as registration availability toggles or AI usage limits), or temporary outages caused by hosting, database, email, storage, or third-party AI model providers.',
    ],
  },
  {
    id: 'account-suspension-and-termination',
    number: 11,
    title: 'Account Suspension and Termination',
    paragraphs: [
      'You may stop using LearnSpace at any time and permanently delete your account from the Security section of your Settings page, subject to verification.',
      'LearnSpace administrators reserve the right to suspend or terminate accounts—and record a suspension reason where applicable—if we reasonably determine that an account has violated these Terms, abused platform resources, compromised security, or engaged in prohibited conduct.',
    ],
  },
  {
    id: 'limitation-of-liability',
    number: 12,
    title: 'Limitation of Liability',
    paragraphs: [
      'To the fullest extent permitted by applicable law, LearnSpace is provided on an "as is" and "as available" basis without warranties of uninterrupted availability, fitness for a particular academic outcome, or complete accuracy of AI-generated material.',
      'Subject to mandatory statutory rights that cannot be excluded under applicable consumer law, [LearnSpace Operating Entity — To Be Designated Prior to Production] will not be liable for indirect, incidental, consequential, or academic loss arising from reliance on AI responses, temporary downtime, or user-submitted materials.',
    ],
  },
  {
    id: 'changes-to-these-terms',
    number: 13,
    title: 'Changes to These Terms',
    paragraphs: [
      'We may revise these Terms periodically as LearnSpace evolves or legal requirements change. Whenever updates occur, we will revise the "Last Updated" date and document version identifier at the top of this page.',
      'For material changes, we may notify registered users through the platform or request renewed acceptance where required prior to continued use.',
    ],
  },
  {
    id: 'contact-information',
    number: 14,
    title: 'Contact Information',
    paragraphs: [
      'Administrative details for production deployment should be reviewed and finalized prior to public release:',
    ],
    bullets: [
      'Operating Entity: [LearnSpace Operating Entity — To Be Designated Prior to Production]',
      'Legal & Support Email: [Support / Legal Contact Email — Configure Prior to Production]',
      'Governing Law & Venue: [Governing Jurisdiction — Subject to Legal Counsel Review]',
      'In-App Product Feedback: Signed-in users can also submit general bug reports or feedback via the workspace Feedback button.',
    ],
  },
];

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    id: 'overview-and-scope',
    number: 1,
    title: 'Overview and Scope',
    paragraphs: [
      'This Privacy Policy describes how LearnSpace collects, stores, processes, and safeguards information when you create an account and use our student workspace, document tools, and AI study assistant.',
      'This document reflects the actual technical implementation of the LearnSpace application and is presented as a draft subject to legal counsel review before commercial launch.',
    ],
  },
  {
    id: 'account-and-profile-data',
    number: 2,
    title: 'Account & Profile Data We Collect',
    paragraphs: ['When you register or customize your LearnSpace profile, we collect and store:'],
    bullets: [
      'Account credentials and identity: full name, lowercase email address, Argon2id-hashed password (never stored in plain text), email verification state, account role, and status.',
      'Consent audit record: explicit Terms and Conditions and Privacy Policy acceptance flag (`termsAccepted`), active document versions, and timestamps recorded on registration.',
      'Optional academic profile information you choose to enter: student ID, programme, academic level, university, and short biography.',
      'Avatar customization data: an uploaded profile photo URL or database-stored image binary (`user_avatars`), plus custom vector avatar settings (`avatarConfig`) when created with the Avatar Studio.',
      'Workspace settings: preferred light/dark/system theme, timezone, in-app and email reminder toggles, and Pomodoro focus/break durations.',
    ],
  },
  {
    id: 'learning-content-and-uploads',
    number: 3,
    title: 'Learning Content & Study Uploads',
    paragraphs: [
      'To provide your personal study workspace across sessions, LearnSpace stores content you create or upload:',
    ],
    bullets: [
      'Courses, notes, planner tasks (titles, due dates, priority, completion state), focus session logs, flashcard decks, study cards, quizzes, and quiz attempt scores.',
      'Uploaded study documents (such as PDF, DOCX, PPTX, TXT, MD, and images), extracted document text and chunk indexes used for study aids and document-grounded answers.',
      'AI Assistant conversations, messages, prompt attachments, and feedback submissions you send within the platform.',
    ],
  },
  {
    id: 'session-and-security-metadata',
    number: 4,
    title: 'Session, Security & Usage Metadata',
    paragraphs: [
      'To protect accounts, enforce rate limits, and keep the platform reliable, we process:',
    ],
    bullets: [
      'Authentication tokens: short-lived JWT access tokens kept in memory and rotating HTTP-only refresh tokens stored in the `ls_refresh` cookie (paired with hashed database token records to detect reuse).',
      'Login and security history: authentication method (`email` or `google`), success/failure status, IP address, user-agent string, failed-attempt counters, lockout timestamps, and suspension reasons when set by administrators.',
      'Operational telemetry: coarse activity events (e.g., signups, uploads, AI messages), server error logs (excluding raw secret values), and token usage counts.',
    ],
  },
  {
    id: 'how-we-use-information',
    number: 5,
    title: 'How We Use Information',
    paragraphs: [
      'LearnSpace uses collected information strictly to operate and protect the workspace:',
    ],
    bullets: [
      'Create and authenticate your account, verify email ownership via OTP codes, and handle password resets.',
      'Display your profile, avatar, courses, notes, planner deadlines, study stats, and learning tools.',
      'Extract text from uploaded study materials and generate AI tutor responses, summaries, flashcards, and quizzes requested by you.',
      'Send opted-in study task reminders and essential transactional security emails.',
      'Detect brute-force attempts, token replay, suspicious logins, or abuse of platform limits.',
    ],
  },
  {
    id: 'third-party-providers',
    number: 6,
    title: 'Infrastructure & Third-Party Service Providers',
    paragraphs: [
      'Depending on deployment configuration, LearnSpace interacts only with the following categories of technical service providers implemented in our backend:',
    ],
    bullets: [
      'Database Hosting: PostgreSQL stores structured application records, consent logs, study content, and database-backed avatars when external object storage is unconfigured.',
      'Media & Document Storage (Optional): When `CLOUDINARY_URL` is configured, uploaded avatars and documents may be transmitted to and served via Cloudinary.',
      'Transactional Email Delivery: Configured email provider (`Resend`, `SMTP`, or `EmailJS`) delivers verification codes, password reset links, and enabled reminders.',
      'Google OAuth (Optional): When Google sign-in is enabled, choosing "Continue with Google" exchanges an authorization code with Google to verify your email, name, and profile picture.',
      'AI Model Providers: When you use the AI Assistant or document study generation tools, your prompts, selected context snippets, and attachments are sent to configured inference APIs (Google Gemini and/or NVIDIA NIM endpoints) to generate responses.',
    ],
    callout: {
      title: 'No Ad Networks or Data Brokers',
      body: 'LearnSpace does not include third-party advertising trackers or sell student profile data to advertisers.',
    },
  },
  {
    id: 'security-measures',
    number: 7,
    title: 'Security Practices Implemented',
    paragraphs: [
      'LearnSpace incorporates practical technical safeguards directly in its architecture:',
    ],
    bullets: [
      'Argon2id password hashing with per-user salts and dummy timing equalization on login.',
      'Rotating refresh token families with automatic family revocation upon token reuse detection, HTTP-only refresh cookies, and CSRF header verification.',
      'Account lockout protection after repeated failed password attempts and strict Zod schema validation on API endpoints.',
      'Server-side validation and re-encoding via `sharp` for uploaded profile images, stripping embedded EXIF/camera metadata before storage.',
      'Role-based authorization controls between student accounts and administrative tools.',
    ],
  },
  {
    id: 'your-choices-and-account-deletion',
    number: 8,
    title: 'Your Controls & Account Deletion',
    paragraphs: ['You control your workspace data directly inside LearnSpace:'],
    bullets: [
      'Edit or clear optional profile fields (`studentId`, `programme`, `level`, `university`, `bio`) in Profile.',
      'Replace, customize, or remove your profile photo / custom avatar at any time.',
      'Toggle email task reminders or product updates inside Settings.',
      'Create, edit, or delete notes, tasks, decks, uploaded documents, and AI chats within your workspace.',
      'Permanently delete your account from the Security section of Settings, which cascades removal of user-owned PostgreSQL workspace records.',
    ],
  },
  {
    id: 'changes-and-contact',
    number: 9,
    title: 'Policy Updates & Privacy Contact',
    paragraphs: [
      'We may update this Privacy Policy as LearnSpace features or third-party integrations change. Updates will carry a revised version number and Last Updated date.',
      'Before production deployment, complete these administrative contact and retention placeholders:',
    ],
    bullets: [
      'Data Controller / Operator: [LearnSpace Operating Entity — To Be Designated Prior to Production]',
      'Privacy Contact Email: [Privacy / Data Protection Email — Configure Prior to Production]',
      'Retention & Compliance Jurisdiction: [Retention Schedule & Governing Law — Subject to Legal Counsel Review]',
    ],
  },
];

export const LEGAL_DOCUMENTS: Record<LegalDocumentKind, LegalDocumentData> = {
  terms: {
    kind: 'terms',
    title: 'Terms and Conditions',
    route: '/terms-and-conditions',
    subtitle:
      'Rules, account responsibilities, AI disclaimers, and workspace guidelines for using LearnSpace.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    lastUpdated: LEGAL_LAST_UPDATED,
    draftNotice: LEGAL_DRAFT_NOTICE,
    sections: TERMS_SECTIONS,
  },
  privacy: {
    kind: 'privacy',
    title: 'Privacy Policy',
    route: '/privacy-policy',
    subtitle:
      'How LearnSpace handles account data, uploaded study materials, AI prompts, avatars, and security records.',
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    lastUpdated: LEGAL_LAST_UPDATED,
    draftNotice: LEGAL_DRAFT_NOTICE,
    sections: PRIVACY_SECTIONS,
  },
};

export function getLegalDocument(kind: LegalDocumentKind): LegalDocumentData {
  return LEGAL_DOCUMENTS[kind];
}
