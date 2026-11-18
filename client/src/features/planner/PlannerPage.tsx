import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
  useToast,
} from '../../design';
import { ApiError, request } from '../../lib/apiClient';
import { CourseBadge } from '../courses/CourseBadge';
import { CourseSelect } from '../courses/CourseSelect';
import { listCourses } from '../courses/coursesApi';

type TaskView = 'today' | 'upcoming' | 'overdue' | 'done' | 'all';

interface Task {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  dueAt: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'done';
  completedAt: string | null;
  reminderOffsetMinutes: number | null;
}

const VIEWS: Array<{ id: TaskView; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'done', label: 'Completed' },
  { id: 'all', label: 'All' },
];

export function PlannerPage() {
  const toast = useToast();
  const qc = useQueryClient();

  const [view, setView] = useState<TaskView>('all');
  const [courseFilter, setCourseFilter] = useState('');
  const [title, setTitle] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [offset, setOffset] = useState<string>('');
  const [courseId, setCourseId] = useState('');
  const [creating, setCreating] = useState(false);

  const coursesQuery = useQuery({
    queryKey: ['courses', 'active'],
    queryFn: () => listCourses({ archived: 'active' }).catch(() => []),
  });
  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);

  const tasksQuery = useQuery({
    queryKey: ['tasks', view, courseFilter],
    queryFn: () => {
      const sp = new URLSearchParams({ view });
      if (courseFilter) sp.set('courseId', courseFilter);
      return request<{ items: Task[]; nextCursor: string | null }>(`/tasks?${sp.toString()}`);
    },
  });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const dueAt = dueLocal ? new Date(dueLocal).toISOString() : null;
      const reminderOffsetMinutes = dueAt && offset !== '' ? Number(offset) : null;

      await request<Task>('/tasks', {
        method: 'POST',
        body: {
          title: trimmed,
          dueAt,
          priority,
          reminderOffsetMinutes,
          courseId: courseId || null,
        },
      });
      setTitle('');
      setDueLocal('');
      setOffset('');
      setCourseId('');
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
      toast.show({ kind: 'success', title: 'Task added' });
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not add task',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setCreating(false);
    }
  };

  const toggleDone = async (task: Task) => {
    try {
      await request<Task>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: { status: task.status === 'done' ? 'todo' : 'done' },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await request<void>(`/tasks/${id}`, { method: 'DELETE' });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['tasks'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
        qc.invalidateQueries({ queryKey: ['courses'] }),
      ]);
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Delete failed',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-4 rounded-2xl border border-primary-200/80 bg-gradient-to-br from-primary-50 via-surface to-sky-50/70 p-5 shadow-sm dark:border-line/90 dark:from-primary-600/10 dark:via-surface dark:to-sky-500/10 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600/10 text-primary-600 dark:bg-primary-500/15 dark:text-primary-400">
          <CalendarClock className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg">Study Planner</h1>
          <p className="mt-0.5 text-sm text-muted">
            Organize coursework, deadlines, and revision sessions with smart reminders.
          </p>
        </div>
      </div>

      <Card className="p-5 sm:p-6">
        <form
          onSubmit={handleAdd}
          className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[1fr_175px_auto_auto_auto_auto] lg:items-end"
        >
          <Input
            label="New task"
            placeholder="e.g. Review Chapter 4 lecture notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <CourseSelect
            id="task-course"
            label="Course"
            mode="assign"
            value={courseId}
            onChange={setCourseId}
            courses={courses}
            className="w-full"
          />
          <div>
            <label htmlFor="task-due" className="mb-1.5 block text-sm font-medium text-fg">
              Due
            </label>
            <input
              id="task-due"
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium text-fg">
              Priority
            </label>
            <select
              id="task-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
              className="h-10 rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label htmlFor="task-reminder" className="mb-1.5 block text-sm font-medium text-fg">
              Reminder
            </label>
            <select
              id="task-reminder"
              value={offset}
              disabled={!dueLocal}
              onChange={(e) => setOffset(e.target.value)}
              className="h-10 rounded-xl border border-line bg-surface2/50 px-3 text-sm text-fg transition-colors focus:border-primary-500 focus:bg-surface focus:outline-none disabled:opacity-50"
            >
              <option value="">None</option>
              <option value="0">At due time</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </select>
          </div>
          <Button type="submit" loading={creating}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Task views"
          className="inline-flex flex-wrap gap-1 rounded-xl bg-surface2/80 p-1 ring-1 ring-line/60"
        >
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-base ease-soft ${
                view === v.id
                  ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                  : 'text-muted hover:text-fg'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <CourseSelect
          ariaLabel="Filter tasks by course"
          mode="filter"
          value={courseFilter}
          onChange={setCourseFilter}
          courses={courses}
          className="h-9 text-xs sm:min-w-[180px]"
        />
      </div>

      <Card className="divide-y divide-line/80 overflow-hidden !p-0">
        {tasksQuery.isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : tasksQuery.isError ? (
          <div className="p-5">
            <ErrorState title="Could not load tasks" onRetry={() => void tasksQuery.refetch()} />
          </div>
        ) : (tasksQuery.data?.items.length ?? 0) === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={CalendarClock}
              title="No tasks here"
              description="Add assignments, readings, or revision goals above."
            />
          </div>
        ) : (
          tasksQuery.data!.items.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface2/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={
                    task.status === 'done' ? `Mark ${task.title} as todo` : `Complete ${task.title}`
                  }
                  onClick={() => void toggleDone(task)}
                  className="text-primary-600 transition-transform hover:scale-105 hover:text-primary-700"
                >
                  {task.status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted hover:text-primary-500" />
                  )}
                </button>
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-medium ${
                      task.status === 'done' ? 'line-through text-muted' : 'text-fg'
                    }`}
                  >
                    {task.title}
                  </p>
                  {task.dueAt ? (
                    <p className="text-xs text-muted">
                      Due {new Date(task.dueAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {task.courseId ? <CourseBadge course={courseById.get(task.courseId)} link /> : null}
                <Badge
                  tone={
                    task.priority === 'high'
                      ? 'danger'
                      : task.priority === 'medium'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {task.priority}
                </Badge>
                <button
                  type="button"
                  aria-label={`Delete ${task.title}`}
                  onClick={() => void handleDelete(task.id)}
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface2 hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
