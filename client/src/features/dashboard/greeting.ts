export function sanitizeFirstName(rawName: string | null | undefined): string {
  if (!rawName) return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = rawName.replace(/[\u0000-\u001F\u007F<>]/g, '').trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/)[0] ?? '';
}

export function timeOfDayLabel(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export interface DashboardGreetingResult {
  heading: string;
  timeGreeting: string;
  intro: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function buildDashboardGreeting(params: {
  name?: string | null;
  isFirstVisit?: boolean;
  lastLoginAt?: string | null;
  now?: Date;
}): DashboardGreetingResult {
  const now = params.now ?? new Date();
  const firstName = sanitizeFirstName(params.name);
  const tod = timeOfDayLabel(now.getHours());

  if (params.isFirstVisit) {
    return {
      heading: firstName ? `Welcome to LearnSpace, ${firstName} 👋` : 'Welcome to LearnSpace 👋',
      timeGreeting: tod,
      intro: 'Your academic workspace is ready. Start with a quick step below.',
    };
  }

  const lastMs = params.lastLoginAt ? Date.parse(params.lastLoginAt) : Number.NaN;
  const daysAbsent = Number.isFinite(lastMs) ? now.getTime() - lastMs : 0;

  if (daysAbsent >= THIRTY_DAYS_MS) {
    return {
      heading: firstName ? `Good to see you again, ${firstName}` : 'Good to see you again',
      timeGreeting: firstName ? `${tod}, ${firstName}` : tod,
      intro: 'Pick up right where you left off.',
    };
  }

  return {
    heading: firstName ? `Welcome back, ${firstName}` : 'Welcome back',
    timeGreeting: firstName ? `${tod}, ${firstName}` : tod,
    intro: 'Pick a study tool below to keep your momentum going.',
  };
}
