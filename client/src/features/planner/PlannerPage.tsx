import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Skeleton, useToast } from '../../design';
import { ApiError, request } from '../../lib/apiClient';

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
  const [title, setTitle] = useState('');
  const [dueLocal, setDueLocal] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [offset, setOffset] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ['tasks', view],
    queryFn: () =>
      request<{ items: Task[]; nextCursor: string | null }>(`/tasks?view=${view}`),
  });

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setCreating(true);
    try {
      const dueAt = dueLocal ? new Date(dueLocal).toISOString() : null;
      const reminderOffsetMinutes =
        dueAt && offset !== '' ? Number(offset) : null;

      await request<Task>('/tasks', {
        method: 'POST',
        body: { title: trimmed, dueAt, priority, reminderOffsetMinutes },
      });
      setTitle('');
      setDueLocal('');
      setOffset('');
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
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
      <Card className="p-5">
        <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
          <Input
            label="New task"
            placeholder="e.g. Review Chapter 4 lecture notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
              className="h-10 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg"
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
              className="h-10 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg"
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
              className="h-10 rounded-lg border border-line bg-bg px-2.5 text-sm text-fg disabled:opacity-50"
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

      <div role="tablist" aria-label="Task views" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            onClick={() => setView(v.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              view === v.id
                ? 'bg-primary-600 text-white'
                : 'border border-line bg-surface text-muted hover:text-fg'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Card className="divide-y divide-line">
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
            <div key={task.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={task.status === 'done' ? `Mark ${task.title} as todo` : `Complete ${task.title}`}
                  onClick={() => void toggleDone(task)}
                  className="text-primary-600 hover:text-primary-700"
                >
                  {task.status === 'done' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted" />
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
                  className="rounded p-1.5 text-muted hover:bg-surface2 hover:text-danger"
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

