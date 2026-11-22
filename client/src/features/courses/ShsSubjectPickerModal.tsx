import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { Badge, Button, Input, Modal, Skeleton, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { fetchShsCatalogue, saveShsOnboardingSubjects } from './coursesApi';

export function ShsSubjectPickerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();

  const [schoolYear, setSchoolYear] = useState<'SHS 1' | 'SHS 2' | 'SHS 3'>(
    (user?.schoolYear as 'SHS 1' | 'SHS 2' | 'SHS 3') || 'SHS 1',
  );
  const [programmeSlug, setProgrammeSlug] = useState('');
  const [schoolName, setSchoolName] = useState(user?.schoolName ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const catQuery = useQuery({
    queryKey: ['shs', 'catalogue'],
    queryFn: fetchShsCatalogue,
    enabled: open,
    staleTime: 60_000,
  });

  const toggleId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.length === 0 && customNames.length === 0) {
      toast.show({ kind: 'error', title: 'Select at least one subject or add a custom subject.' });
      return;
    }
    setSaving(true);
    try {
      const selectedProg = catQuery.data?.programmes.find((p) => p.slug === programmeSlug);
      const res = await saveShsOnboardingSubjects({
        schoolYear,
        schoolName: schoolName.trim() || null,
        programme: selectedProg?.name ?? null,
        subjectIds: selectedIds,
        customNames,
      });
      if (user) {
        updateUser({
          ...user,
          schoolYear,
          schoolName: schoolName.trim() || null,
        });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['courses'] }),
        qc.invalidateQueries({ queryKey: ['users', 'me'] }),
      ]);
      toast.show({
        kind: 'success',
        title: `Added ${res.subjectsCount} SHS subject(s)`,
      });
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save subjects',
        description: err instanceof ApiError ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const subjects = catQuery.data?.subjects ?? [];
  const coreSubjects = subjects.filter((s) => s.isCore);
  const electiveSubjects = subjects.filter(
    (s) => !s.isCore && (!programmeSlug || s.programmeSlugs.includes(programmeSlug)),
  );

  return (
    <Modal open={open} onClose={onClose} title="Pick Your SHS Subjects">
      {catQuery.isLoading ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <form onSubmit={handleSave} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">SHS Year</span>
              <select
                value={schoolYear}
                onChange={(e) => setSchoolYear(e.target.value as 'SHS 1' | 'SHS 2' | 'SHS 3')}
                className="h-9 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-fg"
              >
                <option value="SHS 1">SHS 1</option>
                <option value="SHS 2">SHS 2</option>
                <option value="SHS 3">SHS 3</option>
              </select>
            </label>
            <label className="block space-y-1 text-xs">
              <span className="font-medium text-fg">Programme / Learning Area</span>
              <select
                value={programmeSlug}
                onChange={(e) => setProgrammeSlug(e.target.value)}
                className="h-9 w-full rounded-xl border border-line bg-surface2 px-3 text-sm text-fg"
              >
                <option value="">All programmes</option>
                {catQuery.data?.programmes.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Input
            label="School name (optional)"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            placeholder="e.g. Prempeh College"
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold text-fg">Core Subjects</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {coreSubjects.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-line/80 bg-surface2/40 px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleId(s.id)}
                  />
                  <span className="font-medium text-fg">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-fg">Elective Subjects</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {electiveSubjects.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-line/80 bg-surface2/40 px-3 py-2 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleId(s.id)}
                  />
                  <span className="font-medium text-fg">{s.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-fg">Add Custom Subject (optional)</p>
            <div className="flex gap-2">
              <Input
                label="Custom subject name"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="e.g. Ceramics"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const val = customInput.trim();
                  if (!val || customNames.includes(val)) return;
                  setCustomNames((prev) => [...prev, val]);
                  setCustomInput('');
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </Button>
            </div>
            {customNames.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {customNames.map((n) => (
                  <Badge key={n} tone="primary">
                    {n}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <p className="text-[11px] text-muted">
            <BookOpen className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Source: {catQuery.data?.syllabusSource}
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={saving}>
              Save subjects
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
