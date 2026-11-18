import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CalendarDays, Clock, Edit3, MapPin, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppPath } from '../../app/basePath';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  useToast,
} from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { CourseBadge } from '../courses/CourseBadge';
import { listCourses } from '../courses/coursesApi';
import { TimetableEntryModal } from './TimetableEntryModal';
import {
  DAY_NAMES,
  DAY_SHORT,
  WEEKDAYS_ALL,
  WEEKDAYS_WORK,
  createTimetableEntry,
  deleteTimetableEntry,
  formatMinutes,
  listTimetable,
  updateTimetableEntry,
  type TimetableEntry,
  type TimetableMutationPayload,
} from './timetableApi';

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 20;
const PX_PER_MINUTE = 1; // 60px per hour

const WEEKDAY_TOKEN_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function currentWeekdayInTz(timeZone: string): number {
  try {
    const short = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
    }).format(new Date());
    return WEEKDAY_TOKEN_MAP[short] ?? new Date().getDay();
  } catch {
    return new Date().getDay();
  }
}

function typeLabel(t: TimetableEntry['type']): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function formatDurationBadge(startMin: number, endMin: number): string {
  const mins = Math.max(0, endMin - startMin);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function TimetablePage() {
  const path = useAppPath();
  const toast = useToast();
  const qc = useQueryClient();

  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [showWeekend, setShowWeekend] = useState(false);
  const [courseFilter, setCourseFilter] = useState('');
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const d = new Date().getDay();
    return d === 0 || d === 6 ? 1 : d;
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [modalDefaultDay, setModalDefaultDay] = useState<number>(1);
  const [deletingEntry, setDeletingEntry] = useState<TimetableEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingReminder, setUpdatingReminder] = useState(false);

  const timetableQuery = useQuery({
    queryKey: ['timetable'],
    queryFn: listTimetable,
  });

  const coursesQuery = useQuery({
    queryKey: ['courses', 'active'],
    queryFn: () => listCourses({ archived: 'active' }).catch(() => []),
  });

  const allEntries = useMemo(
    () => timetableQuery.data?.entries ?? [],
    [timetableQuery.data?.entries],
  );
  const timezone = timetableQuery.data?.timezone ?? 'UTC';
  const defaultReminderMinutes = timetableQuery.data?.defaultReminderMinutes ?? 15;
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);

  const todayWeekday = useMemo(() => currentWeekdayInTz(timezone), [timezone]);

  useEffect(() => {
    const hasWeekendClass = allEntries.some((e) => e.dayOfWeek === 0 || e.dayOfWeek === 6);
    if (hasWeekendClass) setShowWeekend(true);
  }, [allEntries]);

  useEffect(() => {
    if (showWeekend || (todayWeekday >= 1 && todayWeekday <= 5)) {
      setSelectedDay(todayWeekday);
    }
  }, [todayWeekday, showWeekend]);

  const visibleDays = useMemo(
    () => (showWeekend ? [...WEEKDAYS_ALL] : [...WEEKDAYS_WORK]),
    [showWeekend],
  );

  const filteredEntries = useMemo(() => {
    if (!courseFilter) return allEntries;
    return allEntries.filter((e) => e.courseId === courseFilter);
  }, [allEntries, courseFilter]);

  const entriesByDay = useMemo(() => {
    const map = new Map<number, TimetableEntry[]>();
    for (const d of WEEKDAYS_ALL) map.set(d, []);
    for (const entry of filteredEntries) {
      map.get(entry.dayOfWeek)?.push(entry);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startMinute - b.startMinute);
    }
    return map;
  }, [filteredEntries]);

  const { gridStartHour, gridEndHour } = useMemo(() => {
    if (filteredEntries.length === 0) {
      return { gridStartHour: DEFAULT_START_HOUR, gridEndHour: DEFAULT_END_HOUR };
    }
    let minM = DEFAULT_START_HOUR * 60;
    let maxM = DEFAULT_END_HOUR * 60;
    for (const e of filteredEntries) {
      if (e.startMinute < minM) minM = e.startMinute;
      if (e.endMinute > maxM) maxM = e.endMinute;
    }
    return {
      gridStartHour: Math.max(0, Math.floor(minM / 60)),
      gridEndHour: Math.min(24, Math.ceil(maxM / 60)),
    };
  }, [filteredEntries]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = gridStartHour; h < gridEndHour; h++) arr.push(h);
    return arr;
  }, [gridStartHour, gridEndHour]);

  const gridStartMin = gridStartHour * 60;
  const gridHeightPx = hours.length * 60 * PX_PER_MINUTE;

  const invalidateAll = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['timetable'] }),
      qc.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);

  const handleSaveEntry = async (payload: TimetableMutationPayload) => {
    if (editingEntry) {
      await updateTimetableEntry(editingEntry.id, payload);
      toast.show({ kind: 'success', title: 'Class updated' });
    } else {
      await createTimetableEntry(payload);
      toast.show({ kind: 'success', title: 'Class added to timetable' });
    }
    await invalidateAll();
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    setDeleting(true);
    try {
      await deleteTimetableEntry(deletingEntry.id);
      await invalidateAll();
      toast.show({ kind: 'success', title: 'Class removed' });
      setDeletingEntry(null);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Could not delete class.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDefaultReminderChange = async (mins: number) => {
    setUpdatingReminder(true);
    try {
      await request('/users/me/settings', {
        method: 'PATCH',
        body: { classReminderMinutes: mins },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['timetable'] }),
        qc.invalidateQueries({ queryKey: ['users', 'me', 'settings'] }),
      ]);
      toast.show({
        kind: 'success',
        title: 'Class reminder default updated',
        description: `Default reminder set to ${mins === 0 ? 'class start time' : `${mins} minutes before`}.`,
      });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Could not update reminder setting.',
      });
    } finally {
      setUpdatingReminder(false);
    }
  };

  const openAddModal = (day = 1) => {
    setEditingEntry(null);
    setModalDefaultDay(day);
    setModalOpen(true);
  };

  const openEditModal = (entry: TimetableEntry) => {
    setEditingEntry(entry);
    setModalDefaultDay(entry.dayOfWeek);
    setModalOpen(true);
  };

  const renderDayAgenda = (day: number) => {
    const items = entriesByDay.get(day) ?? [];
    return (
      <Card className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-fg">
              {DAY_NAMES[day]}
              {day === todayWeekday ? (
                <Badge tone="primary" className="ml-2">
                  Today
                </Badge>
              ) : null}
            </h2>
            <p className="text-xs text-muted">
              {items.length} {items.length === 1 ? 'class' : 'classes'} scheduled
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => openAddModal(day)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add {DAY_SHORT[day]} class
          </Button>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={`No classes on ${DAY_NAMES[day]}`}
            description="Enjoy a lighter day or add a lecture, lab, tutorial, or seminar slot."
            action={
              <Button type="button" size="sm" onClick={() => openAddModal(day)}>
                Add class
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const accent = item.course.color ?? '#2563EB';
              const effectiveLead = item.reminderMinutes ?? defaultReminderMinutes;
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 rounded-2xl border border-line/90 bg-surface p-4 shadow-sm transition-colors hover:border-primary-300 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderLeftWidth: '4px', borderLeftColor: accent }}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-surface2 px-2 py-0.5 text-xs font-semibold text-fg tabular-nums">
                        <Clock className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                        {formatMinutes(item.startMinute)} – {formatMinutes(item.endMinute)}
                      </span>
                      <span className="text-xs text-muted">
                        ({formatDurationBadge(item.startMinute, item.endMinute)})
                      </span>
                      <Badge tone="neutral">{typeLabel(item.type)}</Badge>
                      {item.venue ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {item.venue}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <CourseBadge
                        course={{
                          id: item.courseId,
                          name: item.course.name,
                          code: item.course.code,
                          color: item.course.color,
                        }}
                        link
                      />
                      <Link
                        to={path(`/courses/${item.courseId}`)}
                        className="truncate text-sm font-semibold text-fg hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        {item.course.name}
                      </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                      {item.course.lecturer ? <span>{item.course.lecturer}</span> : null}
                      <span className="inline-flex items-center gap-1">
                        {item.reminderEnabled ? (
                          <>
                            <Bell className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400" />
                            {effectiveLead === 0
                              ? 'Reminder at start'
                              : `${effectiveLead}m reminder`}
                          </>
                        ) : (
                          <>
                            <BellOff className="h-3.5 w-3.5" />
                            Reminder off
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${item.course.name} on ${DAY_NAMES[item.dayOfWeek]}`}
                      onClick={() => openEditModal(item)}
                    >
                      <Edit3 className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${item.course.name} on ${DAY_NAMES[item.dayOfWeek]}`}
                      onClick={() => setDeletingEntry(item)}
                      className="text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Timetable</h1>
            <p className="mt-0.5 text-sm text-muted">
              Weekly class schedule with clash detection and local reminders (
              <Link
                to={path('/settings')}
                className="font-medium text-primary-600 hover:underline dark:text-primary-400"
              >
                {timezone}
              </Link>
              ).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-sm">
            <Bell
              className="h-3.5 w-3.5 text-primary-600 dark:text-primary-400"
              aria-hidden="true"
            />
            <label htmlFor="tt-default-reminder">Remind:</label>
            <select
              id="tt-default-reminder"
              aria-label="Default class reminder lead time"
              value={String(defaultReminderMinutes)}
              disabled={updatingReminder}
              onChange={(e) => void handleDefaultReminderChange(Number(e.target.value))}
              className="bg-transparent text-xs font-semibold text-primary-600 focus:outline-none dark:text-primary-400"
            >
              <option value="0">At start</option>
              <option value="5">5m before</option>
              <option value="10">10m before</option>
              <option value="15">15m before</option>
              <option value="30">30m before</option>
              <option value="60">1h before</option>
            </select>
          </div>

          <Button type="button" onClick={() => openAddModal(selectedDay)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add class
          </Button>
        </div>
      </div>

      {/* Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Timetable view"
            className="hidden md:inline-flex rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'week'}
              onClick={() => setViewMode('week')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                viewMode === 'week'
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Week grid
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'day'}
              onClick={() => setViewMode('day')}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all ${
                viewMode === 'day'
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Day view
            </button>
          </div>

          <label
            htmlFor="tt-weekend-toggle"
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-xs font-medium text-fg shadow-sm hover:border-primary-300"
          >
            <input
              id="tt-weekend-toggle"
              type="checkbox"
              checked={showWeekend}
              onChange={(e) => setShowWeekend(e.target.checked)}
              className="accent-primary-600"
            />
            Include Sat &amp; Sun
          </label>
        </div>

        <select
          aria-label="Filter timetable by course"
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          className="h-9 rounded-xl border border-line bg-surface px-3 text-xs text-fg shadow-sm transition-colors focus:border-primary-500 focus:outline-none"
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} — ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Main Content */}
      {timetableQuery.isLoading ? (
        <Skeleton className="h-[480px] w-full rounded-2xl" />
      ) : timetableQuery.isError ? (
        <ErrorState
          title="Could not load timetable"
          onRetry={() => void timetableQuery.refetch()}
        />
      ) : allEntries.length === 0 ? (
        <Card className="p-8 sm:p-10">
          <EmptyState
            icon={CalendarDays}
            title="No classes in your timetable yet"
            description={
              courses.length === 0
                ? 'First add your courses, then build your weekly timetable with automatic clash checks.'
                : 'Add your lectures, labs, and tutorials to see your weekly grid and get class reminders.'
            }
            action={
              courses.length === 0 ? (
                <Link to={path('/courses')}>
                  <Button type="button">Add your first course</Button>
                </Link>
              ) : (
                <Button type="button" onClick={() => openAddModal(1)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add first class
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          {/* Day selector strip (always shown in Day view, and always shown on mobile < md) */}
          <div className={viewMode === 'day' ? 'space-y-4' : 'space-y-4 md:hidden'}>
            <div
              role="tablist"
              aria-label="Select day of week"
              className="flex gap-1.5 overflow-x-auto pb-1"
            >
              {visibleDays.map((day) => {
                const count = entriesByDay.get(day)?.length ?? 0;
                const active = selectedDay === day;
                return (
                  <button
                    key={day}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDay(day)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all ${
                      active
                        ? 'border-primary-500 bg-primary-600 text-white shadow-sm'
                        : 'border-line bg-surface text-fg hover:border-primary-300'
                    }`}
                  >
                    <span>{DAY_SHORT[day]}</span>
                    {count > 0 ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                          active ? 'bg-white/20 text-white' : 'bg-surface2 text-muted'
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {renderDayAgenda(selectedDay)}
          </div>

          {/* Desktop Weekly Grid */}
          {viewMode === 'week' ? (
            <Card className="hidden overflow-x-auto !p-0 md:block">
              <div className="min-w-[760px]">
                {/* Day Headers */}
                <div
                  className="grid border-b border-line/80 bg-surface2/50"
                  style={{
                    gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="border-r border-line/70 px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Time
                  </div>
                  {visibleDays.map((day) => {
                    const isToday = day === todayWeekday;
                    const count = entriesByDay.get(day)?.length ?? 0;
                    return (
                      <div
                        key={day}
                        className={`flex items-center justify-between border-r border-line/70 px-3 py-2.5 last:border-r-0 ${
                          isToday ? 'bg-primary-50/75 dark:bg-primary-500/10' : ''
                        }`}
                      >
                        <div>
                          <p
                            className={`text-sm font-semibold ${
                              isToday ? 'text-primary-700 dark:text-primary-300' : 'text-fg'
                            }`}
                          >
                            {DAY_NAMES[day]}
                          </p>
                          <p className="text-[11px] text-muted">
                            {count} {count === 1 ? 'slot' : 'slots'}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={`Add class on ${DAY_NAMES[day]}`}
                          title={`Add class on ${DAY_NAMES[day]}`}
                          onClick={() => openAddModal(day)}
                          className="rounded-lg p-1 text-muted transition-colors hover:bg-primary-100/70 hover:text-primary-600 dark:hover:bg-white/10"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Proportional Time Grid */}
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  {/* Hour Labels */}
                  <div
                    className="relative border-r border-line/70 bg-surface2/25"
                    style={{ height: `${gridHeightPx}px` }}
                  >
                    {hours.map((hour, idx) => (
                      <div
                        key={hour}
                        className="absolute inset-x-0 border-t border-line/60 px-2 pt-1 text-right text-[11px] font-medium text-muted tabular-nums"
                        style={{
                          top: `${idx * 60 * PX_PER_MINUTE}px`,
                          height: `${60 * PX_PER_MINUTE}px`,
                        }}
                      >
                        {String(hour).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Day Columns */}
                  {visibleDays.map((day) => {
                    const dayItems = entriesByDay.get(day) ?? [];
                    const isToday = day === todayWeekday;
                    return (
                      <div
                        key={day}
                        className={`relative border-r border-line/70 last:border-r-0 ${
                          isToday ? 'bg-primary-50/20 dark:bg-primary-500/[0.03]' : ''
                        }`}
                        style={{ height: `${gridHeightPx}px` }}
                      >
                        {/* Hour Grid Lines */}
                        {hours.map((hour, idx) => (
                          <div
                            key={hour}
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-x-0 border-t border-line/45"
                            style={{ top: `${idx * 60 * PX_PER_MINUTE}px` }}
                          />
                        ))}

                        {/* Positioned Class Blocks */}
                        {dayItems.map((item) => {
                          const accent = item.course.color ?? '#2563EB';
                          const topPx = Math.max(
                            0,
                            (item.startMinute - gridStartMin) * PX_PER_MINUTE,
                          );
                          const heightPx = Math.max(
                            36,
                            (item.endMinute - item.startMinute) * PX_PER_MINUTE - 2,
                          );
                          const compact = heightPx < 58;
                          return (
                            <div
                              key={item.id}
                              style={{
                                top: `${topPx + 1}px`,
                                height: `${heightPx}px`,
                                borderLeftWidth: '4px',
                                borderLeftColor: accent,
                                backgroundColor: `${accent}16`,
                              }}
                              className="group absolute inset-x-1.5 overflow-hidden rounded-xl border border-line/70 px-2.5 py-1.5 shadow-sm transition-shadow hover:z-10 hover:shadow-md dark:bg-surface2/90"
                            >
                              <div className="flex items-start justify-between gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(item)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate text-xs font-bold text-fg">
                                    {item.course.code ? `${item.course.code} · ` : ''}
                                    {item.course.name}
                                  </p>
                                  <p className="mt-0.5 truncate text-[11px] font-medium text-muted tabular-nums">
                                    {formatMinutes(item.startMinute)}–
                                    {formatMinutes(item.endMinute)}
                                    {!compact ? ` · ${typeLabel(item.type)}` : ''}
                                  </p>
                                  {!compact && item.venue ? (
                                    <p className="mt-0.5 truncate text-[11px] text-muted">
                                      {item.venue}
                                    </p>
                                  ) : null}
                                </button>

                                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                  <button
                                    type="button"
                                    aria-label={`Edit ${item.course.name} (${formatMinutes(item.startMinute)})`}
                                    onClick={() => openEditModal(item)}
                                    className="rounded p-1 text-muted hover:bg-surface hover:text-fg"
                                  >
                                    <Edit3 className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${item.course.name} (${formatMinutes(item.startMinute)})`}
                                    onClick={() => setDeletingEntry(item)}
                                    className="rounded p-1 text-muted hover:bg-surface hover:text-danger"
                                  >
                                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          ) : null}
        </>
      )}

      <TimetableEntryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        entry={editingEntry}
        defaultDayOfWeek={modalDefaultDay}
        courses={courses}
        existingEntries={allEntries}
        defaultReminderMinutes={defaultReminderMinutes}
        onSubmit={handleSaveEntry}
      />

      <Modal
        open={Boolean(deletingEntry)}
        onClose={() => setDeletingEntry(null)}
        title="Remove class from timetable"
        className="max-w-md"
      >
        {deletingEntry ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Remove{' '}
              <strong className="text-fg">
                {deletingEntry.course.code
                  ? `${deletingEntry.course.code} — ${deletingEntry.course.name}`
                  : deletingEntry.course.name}
              </strong>{' '}
              on {DAY_NAMES[deletingEntry.dayOfWeek]} ({formatMinutes(deletingEntry.startMinute)}–
              {formatMinutes(deletingEntry.endMinute)})?
            </p>
            <div className="flex justify-end gap-2.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDeletingEntry(null)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={deleting}
                onClick={() => void handleConfirmDelete()}
              >
                Remove class
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
