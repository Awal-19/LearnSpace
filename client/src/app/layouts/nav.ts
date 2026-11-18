import {
  Award,
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Timer,
  User,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match only the exact path (needed for "/"). */
  end?: boolean;
}

/** Sidebar (desktop), top-level destinations. */
export const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/courses', label: 'Courses', icon: BookMarked },
  { to: '/chat', label: 'Assistant', icon: MessageSquare },
  { to: '/notes', label: 'Notes', icon: BookOpen },
  { to: '/documents', label: 'Documents', icon: FileUp },
  { to: '/planner', label: 'Planner', icon: CalendarCheck },
  { to: '/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/exams', label: 'Exams', icon: ClipboardCheck },
  { to: '/focus', label: 'Focus', icon: Timer },
  { to: '/study', label: 'Study', icon: GraduationCap },
  { to: '/grades', label: 'Grades', icon: Award },
];

export const ACCOUNT_NAV: NavItem[] = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** Mobile bottom bar: four primary destinations plus "More". */
export const BOTTOM_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/chat', label: 'Assistant', icon: MessageSquare },
  { to: '/notes', label: 'Notes', icon: BookOpen },
  { to: '/documents', label: 'Documents', icon: FileUp },
  { to: '/planner', label: 'Planner', icon: CalendarCheck },
  { to: '/more', label: 'More', icon: MoreHorizontal },
];

/** Page title lookup for the top bar. */
export function titleForPath(pathname: string, base: string): string {
  const path = base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  const all = [...MAIN_NAV, ...ACCOUNT_NAV, ...BOTTOM_NAV];
  const exact = all.find((item) => item.to === path);
  if (exact) return exact.label === 'Home' ? 'Dashboard' : exact.label;
  const prefix = all.find((item) => item.to !== '/' && path.startsWith(`${item.to}/`));
  return prefix?.label ?? 'LearnSpace';
}
