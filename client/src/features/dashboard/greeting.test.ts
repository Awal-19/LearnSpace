import { describe, expect, it } from 'vitest';
import { buildDashboardGreeting, sanitizeFirstName } from './greeting';

describe('dashboard greeting logic', () => {
  it('shows first-visit greeting without "back" or "again" and handles missing names safely', () => {
    const withName = buildDashboardGreeting({ name: 'Ama Mensah', isFirstVisit: true });
    expect(withName.heading).toBe('Welcome to LearnSpace, Ama 👋');
    expect(withName.heading.toLowerCase()).not.toContain('back');
    expect(withName.heading.toLowerCase()).not.toContain('again');

    const noName = buildDashboardGreeting({ name: '', isFirstVisit: true });
    expect(noName.heading).toBe('Welcome to LearnSpace 👋');
    expect(noName.heading).not.toContain('undefined');
  });

  it('shows returning greeting and time-of-day variant for recent returning users', () => {
    const morning = new Date(2026, 10, 20, 9, 0, 0);
    const res = buildDashboardGreeting({
      name: 'Kwame Boateng',
      isFirstVisit: false,
      lastLoginAt: new Date(morning.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      now: morning,
    });
    expect(res.heading).toBe('Welcome back, Kwame');
    expect(res.timeGreeting).toBe('Good morning, Kwame');
  });

  it('shows long-absence greeting when returning after 30+ days', () => {
    const now = new Date(2026, 10, 20, 15, 0, 0);
    const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const res = buildDashboardGreeting({
      name: 'Kofi',
      isFirstVisit: false,
      lastLoginAt: fortyDaysAgo,
      now,
    });
    expect(res.heading).toBe('Good to see you again, Kofi');
    expect(res.timeGreeting).toBe('Good afternoon, Kofi');
  });

  it('sanitizes control characters and angle brackets from first names', () => {
    expect(sanitizeFirstName('  <Ama>\u0007 Mensah ')).toBe('Ama');
    expect(sanitizeFirstName(undefined)).toBe('');
  });
});
