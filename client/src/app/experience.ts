import {
  Award,
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  FileUp,
  GraduationCap,
  Home,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Timer,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export type LearnerExperienceType = 'university' | 'shs';

export interface ExperienceNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface ExperienceConfig {
  learnerType: LearnerExperienceType;
  isShs: boolean;
  workspaceTagline: string;
  labels: {
    home: string;
    courseSingular: string;
    coursePlural: string;
    courseLower: string;
    coursePluralLower: string;
    courseHub: string;
    teacher: string;
    term: string;
    termOptions: readonly string[];
    level: string;
    levelOptions: readonly string[];
    slides: string;
    courseNotes: string;
    examPrep: string;
    recommendedResources: string;
    institution: string;
    studentId: string;
    aiQuizMe: string;
  };
  features: {
    showGpa: boolean;
    showCourseCode: boolean;
    showCreditHours: boolean;
    showUniversityTimetable: boolean;
    showCommunity: boolean;
  };
  nav: {
    mainNav: ExperienceNavItem[];
    bottomNav: ExperienceNavItem[];
    accountNav: ExperienceNavItem[];
  };
  aiQuickActions: ReadonlyArray<{
    id: 'explain_simple' | 'example' | 'quiz_me' | 'summarize';
    label: string;
  }>;
}

const ACCOUNT_NAV: ExperienceNavItem[] = [
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export const EXPERIENCE_CONFIG: Record<LearnerExperienceType, ExperienceConfig> = {
  university: {
    learnerType: 'university',
    isShs: false,
    workspaceTagline: 'AI Study Workspace',
    labels: {
      home: 'Dashboard',
      courseSingular: 'Course',
      coursePlural: 'Courses',
      courseLower: 'course',
      coursePluralLower: 'courses',
      courseHub: 'Open course hub',
      teacher: 'Lecturer',
      term: 'Semester',
      termOptions: [],
      level: 'Level',
      levelOptions: ['Level 100', 'Level 200', 'Level 300', 'Level 400'],
      slides: 'Lecture Slides',
      courseNotes: 'Course Notes',
      examPrep: 'Exams',
      recommendedResources: 'Recommended course resources',
      institution: 'University',
      studentId: 'Student ID',
      aiQuizMe: 'Quiz me',
    },
    features: {
      showGpa: true,
      showCourseCode: true,
      showCreditHours: true,
      showUniversityTimetable: true,
      showCommunity: true,
    },
    nav: {
      mainNav: [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
        { to: '/courses', label: 'Courses', icon: BookMarked },
        { to: '/community', label: 'Community', icon: Users },
        { to: '/chat', label: 'Assistant', icon: MessageSquare },
        { to: '/notes', label: 'Notes', icon: BookOpen },
        { to: '/documents', label: 'Documents', icon: FileUp },
        { to: '/planner', label: 'Planner', icon: CalendarCheck },
        { to: '/timetable', label: 'Timetable', icon: CalendarDays },
        { to: '/exams', label: 'Exams', icon: ClipboardCheck },
        { to: '/focus', label: 'Focus', icon: Timer },
        { to: '/study', label: 'Study', icon: GraduationCap },
        { to: '/grades', label: 'Grades', icon: Award },
      ],
      bottomNav: [
        { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
        { to: '/chat', label: 'Assistant', icon: MessageSquare },
        { to: '/notes', label: 'Notes', icon: BookOpen },
        { to: '/documents', label: 'Documents', icon: FileUp },
        { to: '/planner', label: 'Planner', icon: CalendarCheck },
        { to: '/more', label: 'More', icon: MoreHorizontal },
      ],
      accountNav: ACCOUNT_NAV,
    },
    aiQuickActions: [
      { id: 'explain_simple', label: 'Explain simply' },
      { id: 'example', label: 'Give an example' },
      { id: 'quiz_me', label: 'Quiz me' },
      { id: 'summarize', label: 'Summarize' },
    ],
  },
  shs: {
    learnerType: 'shs',
    isShs: true,
    workspaceTagline: 'SHS & WASSCE Study Space',
    labels: {
      home: 'Home',
      courseSingular: 'Subject',
      coursePlural: 'Subjects',
      courseLower: 'subject',
      coursePluralLower: 'subjects',
      courseHub: 'Open subject hub',
      teacher: 'Teacher',
      term: 'Term',
      termOptions: ['Term 1', 'Term 2', 'Term 3'],
      level: 'SHS Year',
      levelOptions: ['SHS 1', 'SHS 2', 'SHS 3'],
      slides: 'Class notes and handouts',
      courseNotes: 'Subject notes',
      examPrep: 'Exam Prep (WASSCE)',
      recommendedResources: 'Recommended textbooks and revision resources',
      institution: 'School (optional)',
      studentId: 'Index / Student ID (optional)',
      aiQuizMe: 'Test me',
    },
    features: {
      showGpa: false,
      showCourseCode: false,
      showCreditHours: false,
      showUniversityTimetable: false,
      showCommunity: true,
    },
    nav: {
      mainNav: [
        { to: '/', label: 'Home', icon: Home, end: true },
        { to: '/courses', label: 'Subjects', icon: BookMarked },
        { to: '/chat', label: 'Assistant', icon: MessageSquare },
        { to: '/notes', label: 'Notes', icon: BookOpen },
        { to: '/documents', label: 'Handouts', icon: FileUp },
        { to: '/exams', label: 'Exam Prep (WASSCE)', icon: ClipboardCheck },
        { to: '/planner', label: 'Planner', icon: CalendarCheck },
        { to: '/focus', label: 'Focus', icon: Timer },
        { to: '/study', label: 'Study', icon: GraduationCap },
        { to: '/community', label: 'SHS Spaces', icon: Users },
      ],
      bottomNav: [
        { to: '/', label: 'Home', icon: Home, end: true },
        { to: '/courses', label: 'Subjects', icon: BookMarked },
        { to: '/chat', label: 'Assistant', icon: MessageSquare },
        { to: '/exams', label: 'Exam Prep', icon: ClipboardCheck },
        { to: '/more', label: 'More', icon: MoreHorizontal },
      ],
      accountNav: ACCOUNT_NAV,
    },
    aiQuickActions: [
      { id: 'explain_simple', label: 'Explain simply' },
      { id: 'example', label: 'Give an example' },
      { id: 'quiz_me', label: 'Test me' },
      { id: 'summarize', label: 'Summarize' },
    ],
  },
};

export function useExperience(): ExperienceConfig {
  const { user } = useAuth();
  const { search } = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const previewParam = isAdmin ? new URLSearchParams(search).get('preview') : null;
  const effectiveType: LearnerExperienceType =
    previewParam === 'shs'
      ? 'shs'
      : previewParam === 'university'
        ? 'university'
        : user?.learnerType === 'shs'
          ? 'shs'
          : 'university';
  return EXPERIENCE_CONFIG[effectiveType];
}
