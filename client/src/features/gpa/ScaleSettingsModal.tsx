import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Modal, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import {
  createScale,
  deleteScale,
  updateScale,
  type DegreeClassRule,
  type GradeBoundary,
  type GradingScaleConfig,
  type GradingScalePreset,
  type RetakePolicy,
} from './gpaApi';

interface ScaleSettingsModalProps {
  open: boolean;
  activeScale: GradingScaleConfig;
  scales: GradingScaleConfig[];
  presets: GradingScalePreset[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
}

export function ScaleSettingsModal({
  open,
  activeScale,
  scales,
  presets,
  onClose,
  onUpdated,
}: ScaleSettingsModalProps) {
  const toast = useToast();
  const scaleSelectId = useId();
  const retakeSelectId = useId();

  const [selectedId, setSelectedId] = useState(activeScale.id);
  const [creatingNew, setCreatingNew] = useState(false);
  const [name, setName] = useState(activeScale.name);
  const [maxGpa, setMaxGpa] = useState(String(activeScale.maxGpa));
  const [retakePolicy, setRetakePolicy] = useState<RetakePolicy>(activeScale.retakePolicy);
  const [boundaries, setBoundaries] = useState<GradeBoundary[]>(activeScale.boundaries);
  const [degreeClasses, setDegreeClasses] = useState<DegreeClassRule[]>(activeScale.degreeClasses);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(activeScale.id);
    setCreatingNew(false);
    setName(activeScale.name);
    setMaxGpa(String(activeScale.maxGpa));
    setRetakePolicy(activeScale.retakePolicy);
    setBoundaries(activeScale.boundaries);
    setDegreeClasses(activeScale.degreeClasses);
  }, [open, activeScale]);

  const handleSelectExisting = (id: string) => {
    setSelectedId(id);
    setCreatingNew(false);
    const found = scales.find((s) => s.id === id);
    if (!found) return;
    setName(found.name);
    setMaxGpa(String(found.maxGpa));
    setRetakePolicy(found.retakePolicy);
    setBoundaries(found.boundaries);
    setDegreeClasses(found.degreeClasses);
  };

  const applyPreset = (preset: GradingScalePreset) => {
    setName(preset.name);
    setMaxGpa(String(preset.maxGpa));
    setRetakePolicy(preset.retakePolicy);
    setBoundaries(preset.boundaries.map((b) => ({ ...b })));
    setDegreeClasses(preset.degreeClasses.map((c) => ({ ...c })));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const parsedMax = Number(maxGpa);
    if (!Number.isFinite(parsedMax) || parsedMax <= 0 || parsedMax > 10) {
      toast.show({ kind: 'error', title: 'Max GPA must be between 0.1 and 10.0' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        maxGpa: parsedMax,
        retakePolicy,
        boundaries: boundaries.map((b) => ({
          label: b.label.trim(),
          minScore: Number(b.minScore),
          maxScore: Number(b.maxScore),
          gradePoint: Number(b.gradePoint),
          isPass: Boolean(b.isPass),
          ...(b.excludeFromGpa ? { excludeFromGpa: true } : {}),
        })),
        degreeClasses: degreeClasses.map((c) => ({
          label: c.label.trim(),
          minGpa: Number(c.minGpa),
        })),
        isDefault: true,
      };

      if (creatingNew) {
        await createScale(payload);
        toast.show({ kind: 'success', title: 'Custom grading scale created and activated' });
      } else {
        await updateScale(selectedId, payload);
        toast.show({ kind: 'success', title: 'Grading scale updated and set active' });
      }
      await onUpdated();
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not save grading scale',
        description: err instanceof ApiError ? err.message : 'Check boundaries and try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteScale = async () => {
    if (scales.length <= 1 || creatingNew) return;
    try {
      await deleteScale(selectedId);
      toast.show({ kind: 'info', title: 'Grading scale deleted' });
      await onUpdated();
      onClose();
    } catch (err) {
      toast.show({
        kind: 'error',
        title: 'Could not delete scale',
        description: err instanceof ApiError ? err.message : 'Try again.',
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Configure grading scale" className="max-w-2xl">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-[200px] flex-1">
            <label htmlFor={scaleSelectId} className="mb-1 block text-xs font-medium text-fg">
              Saved scales
            </label>
            <select
              id={scaleSelectId}
              value={creatingNew ? '__new__' : selectedId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setCreatingNew(true);
                  setName('Custom Scale');
                } else {
                  handleSelectExisting(e.target.value);
                }
              }}
              className="h-9 w-full rounded-xl border border-line bg-bg px-3 text-sm text-fg focus:border-primary-500 focus:outline-none"
            >
              {scales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.maxGpa.toFixed(1)} max{s.isDefault ? ' · Active' : ''})
                </option>
              ))}
              <option value="__new__">+ Create new custom scale...</option>
            </select>
          </div>

          {!creatingNew && scales.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleDeleteScale()}
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
              Delete scale
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted">Load preset:</span>
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-lg border border-line bg-surface2 px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:border-primary-400"
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Scale name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Maximum GPA"
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={maxGpa}
            onChange={(e) => setMaxGpa(e.target.value)}
            required
          />
          <div>
            <label htmlFor={retakeSelectId} className="mb-1.5 block text-sm font-medium text-fg">
              Retake policy
            </label>
            <select
              id={retakeSelectId}
              value={retakePolicy}
              onChange={(e) => setRetakePolicy(e.target.value as RetakePolicy)}
              className="h-10 w-full rounded-xl border border-line bg-bg px-2.5 text-xs text-fg focus:border-primary-500 focus:outline-none"
            >
              <option value="latest">Latest attempt counts in CGPA</option>
              <option value="highest">Highest grade counts in CGPA</option>
              <option value="include_all">Count all attempts in CGPA</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Grade boundaries
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setBoundaries((prev) => [
                  ...prev,
                  {
                    label: 'P',
                    minScore: 50,
                    maxScore: 100,
                    gradePoint: 0,
                    isPass: true,
                    excludeFromGpa: true,
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add grade
            </Button>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-line divide-y divide-line">
            {boundaries.map((b, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[72px_72px_72px_76px_1fr_auto] items-center gap-2 p-2 text-xs"
              >
                <input
                  aria-label={`Grade label row ${idx + 1}`}
                  value={b.label}
                  onChange={(e) =>
                    setBoundaries((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)),
                    )
                  }
                  className="h-8 rounded-lg border border-line bg-bg px-2 font-medium text-fg"
                />
                <input
                  aria-label={`Min score row ${idx + 1}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={b.minScore}
                  onChange={(e) =>
                    setBoundaries((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, minScore: Number(e.target.value) } : row,
                      ),
                    )
                  }
                  className="h-8 rounded-lg border border-line bg-bg px-2 text-fg"
                />
                <input
                  aria-label={`Max score row ${idx + 1}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={b.maxScore}
                  onChange={(e) =>
                    setBoundaries((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, maxScore: Number(e.target.value) } : row,
                      ),
                    )
                  }
                  className="h-8 rounded-lg border border-line bg-bg px-2 text-fg"
                />
                <input
                  aria-label={`Grade point row ${idx + 1}`}
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  value={b.gradePoint}
                  onChange={(e) =>
                    setBoundaries((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, gradePoint: Number(e.target.value) } : row,
                      ),
                    )
                  }
                  className="h-8 rounded-lg border border-line bg-bg px-2 text-fg"
                />
                <Checkbox
                  label="Exclude"
                  checked={Boolean(b.excludeFromGpa)}
                  onChange={(e) =>
                    setBoundaries((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, excludeFromGpa: e.target.checked } : row,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  disabled={boundaries.length <= 2}
                  aria-label={`Remove grade row ${idx + 1}`}
                  onClick={() => setBoundaries((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded p-1 text-muted hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Degree classifications
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                setDegreeClasses((prev) => [...prev, { label: 'Honours', minGpa: 3.0 }])
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add class
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {degreeClasses.map((c, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-xl border border-line p-2 text-xs"
              >
                <input
                  aria-label={`Degree class label ${idx + 1}`}
                  value={c.label}
                  onChange={(e) =>
                    setDegreeClasses((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row)),
                    )
                  }
                  className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-fg"
                />
                <input
                  aria-label={`Min GPA ${idx + 1}`}
                  type="number"
                  min={0}
                  max={10}
                  step={0.05}
                  value={c.minGpa}
                  onChange={(e) =>
                    setDegreeClasses((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, minGpa: Number(e.target.value) } : row,
                      ),
                    )
                  }
                  className="h-8 w-20 rounded-lg border border-line bg-bg px-2 text-fg"
                />
                <button
                  type="button"
                  disabled={degreeClasses.length <= 1}
                  aria-label={`Remove class ${idx + 1}`}
                  onClick={() => setDegreeClasses((prev) => prev.filter((_, i) => i !== idx))}
                  className="rounded p-1 text-muted hover:text-danger disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            Save &amp; set active
          </Button>
        </div>
      </form>
    </Modal>
  );
}
