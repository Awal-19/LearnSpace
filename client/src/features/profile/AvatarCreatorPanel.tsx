import { Check, RotateCcw, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, useToast } from '../../design';
import { ApiError } from '../../lib/apiClient';
import { exportAvatarSvgFile } from './avatarExport';
import { AvatarIllustration } from './AvatarIllustration';
import {
  BACKGROUND_COLORS,
  CLOTHING_COLORS,
  CLOTHING_STYLES,
  DEFAULT_AVATAR_CONFIG,
  EYEBROW_STYLES,
  EYE_STYLES,
  FACE_SHAPES,
  HAIR_COLORS,
  HAIR_STYLES,
  MOUTH_STYLES,
  NOSE_STYLES,
  randomizeAvatarConfig,
  SKIN_TONES,
  type AvatarConfig,
  type SwatchOption,
  type TraitOption,
} from './avatarTypes';
import { uploadAvatarFile } from './avatarUploadApi';

type CreatorCategory = 'face' | 'hair' | 'features' | 'outfit' | 'backdrop';

const CATEGORIES: Array<{ id: CreatorCategory; label: string }> = [
  { id: 'face', label: 'Face & Skin' },
  { id: 'hair', label: 'Hair' },
  { id: 'features', label: 'Expression' },
  { id: 'outfit', label: 'Clothing' },
  { id: 'backdrop', label: 'Backdrop' },
];

interface AvatarCreatorPanelProps {
  initialConfig?: AvatarConfig | null;
  userName: string;
  onSaved: (result: { avatarUrl: string; avatarConfig: AvatarConfig }) => void;
  onCancel: () => void;
}

function TraitButtonGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<TraitOption<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'border-primary-600 bg-primary-50 text-primary-700 shadow-sm dark:border-primary-400 dark:bg-primary-500/20 dark:text-primary-300'
                  : 'border-line bg-surface text-fg/80 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-300'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwatchPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: SwatchOption[];
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <div className="flex flex-wrap gap-2.5">
        {options.map((swatch) => {
          const active = swatch.value.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={swatch.value}
              type="button"
              title={swatch.label}
              aria-label={`${label}: ${swatch.label}`}
              aria-pressed={active}
              onClick={() => onChange(swatch.value)}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
                active
                  ? 'border-primary-600 ring-2 ring-primary-500/40 ring-offset-2 ring-offset-surface'
                  : 'border-black/15 dark:border-white/20'
              }`}
              style={{ backgroundColor: swatch.value }}
            >
              {active ? (
                <Check
                  className="h-3.5 w-3.5 drop-shadow"
                  style={{
                    color:
                      swatch.value === '#EFF6FF' ||
                      swatch.value === '#DBEAFE' ||
                      swatch.value === '#F1F5F9' ||
                      swatch.value === '#FEF3C7' ||
                      swatch.value === '#D1FAE5' ||
                      swatch.value === '#FFE4E6' ||
                      swatch.value === '#CBD5E1' ||
                      swatch.value === '#FDE2D2' ||
                      swatch.value === '#F6D0B8'
                        ? '#0F172A'
                        : '#FFFFFF',
                  }}
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AvatarCreatorPanel({
  initialConfig,
  userName,
  onSaved,
  onCancel,
}: AvatarCreatorPanelProps) {
  const toast = useToast();
  const svgRef = useRef<SVGSVGElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [config, setConfig] = useState<AvatarConfig>(() => initialConfig ?? DEFAULT_AVATAR_CONFIG);
  const [category, setCategory] = useState<CreatorCategory>('face');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const update = <K extends keyof AvatarConfig>(key: K, val: AvatarConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!svgRef.current) return;
    setBusy(true);
    setError(null);
    setProgress(5);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const file = await exportAvatarSvgFile(svgRef.current, config);
      const result = await uploadAvatarFile(file, {
        config,
        onProgress: (pct) => setProgress(Math.max(10, pct)),
        signal: controller.signal,
      });

      onSaved({
        avatarUrl: result.avatarUrl,
        avatarConfig: result.avatarConfig ?? config,
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return;
      const msg =
        err instanceof Error ? err.message : 'Could not save your custom avatar right now.';
      setError(msg);
      toast.show({ kind: 'error', title: 'Save failed', description: msg });
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs font-medium text-danger"
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[236px_1fr]">
        {/* Live Preview Stage */}
        <div className="flex flex-col items-center justify-between gap-4 rounded-2xl border border-line/80 bg-gradient-to-b from-primary-50/70 to-surface p-4 dark:from-primary-500/10 dark:to-surface2/50">
          <div className="flex flex-col items-center gap-3">
            <div className="h-40 w-40 overflow-hidden rounded-full border-4 border-white shadow-[0_14px_32px_-12px_rgba(37,99,235,0.28)] dark:border-surface2">
              <AvatarIllustration ref={svgRef} config={config} className="h-full w-full" />
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 shadow-sm">
              <div className="h-7 w-7 overflow-hidden rounded-full border border-line/60">
                <AvatarIllustration config={config} className="h-full w-full" />
              </div>
              <span className="max-w-[130px] truncate text-xs font-medium text-fg">{userName}</span>
            </div>
          </div>

          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              className="flex-1"
              onClick={() => setConfig(randomizeAvatarConfig())}
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
              Randomize
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfig(initialConfig ?? DEFAULT_AVATAR_CONFIG)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          </div>
        </div>

        {/* Customization Controls */}
        <div className="min-w-0 space-y-4">
          <div
            role="tablist"
            aria-label="Avatar customization sections"
            className="flex flex-wrap gap-1.5 rounded-xl border border-line bg-surface2/70 p-1"
          >
            {CATEGORIES.map((cat) => {
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setCategory(cat.id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? 'bg-surface text-primary-600 shadow-sm dark:text-primary-400'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-[225px] space-y-4 rounded-2xl border border-line/80 bg-surface p-4">
            {category === 'face' ? (
              <>
                <TraitButtonGroup
                  label="Face shape"
                  options={FACE_SHAPES}
                  value={config.faceShape}
                  onChange={(v) => update('faceShape', v)}
                />
                <SwatchPicker
                  label="Skin tone"
                  options={SKIN_TONES}
                  value={config.skinTone}
                  onChange={(v) => update('skinTone', v)}
                />
              </>
            ) : null}

            {category === 'hair' ? (
              <>
                <TraitButtonGroup
                  label="Hairstyle"
                  options={HAIR_STYLES}
                  value={config.hairStyle}
                  onChange={(v) => update('hairStyle', v)}
                />
                <SwatchPicker
                  label={config.hairStyle === 'hijabi' ? 'Hijab colour' : 'Hair colour'}
                  options={HAIR_COLORS}
                  value={config.hairColor}
                  onChange={(v) => update('hairColor', v)}
                />
              </>
            ) : null}

            {category === 'features' ? (
              <>
                <TraitButtonGroup
                  label="Eyes"
                  options={EYE_STYLES}
                  value={config.eyes}
                  onChange={(v) => update('eyes', v)}
                />
                <TraitButtonGroup
                  label="Eyebrows"
                  options={EYEBROW_STYLES}
                  value={config.eyebrows}
                  onChange={(v) => update('eyebrows', v)}
                />
                <TraitButtonGroup
                  label="Nose"
                  options={NOSE_STYLES}
                  value={config.nose}
                  onChange={(v) => update('nose', v)}
                />
                <TraitButtonGroup
                  label="Mouth"
                  options={MOUTH_STYLES}
                  value={config.mouth}
                  onChange={(v) => update('mouth', v)}
                />
              </>
            ) : null}

            {category === 'outfit' ? (
              <>
                <TraitButtonGroup
                  label="Clothing"
                  options={CLOTHING_STYLES}
                  value={config.clothing}
                  onChange={(v) => update('clothing', v)}
                />
                <SwatchPicker
                  label="Clothing colour"
                  options={CLOTHING_COLORS}
                  value={config.clothingColor}
                  onChange={(v) => update('clothingColor', v)}
                />
              </>
            ) : null}

            {category === 'backdrop' ? (
              <SwatchPicker
                label="Background colour"
                options={BACKGROUND_COLORS}
                value={config.backgroundColor}
                onChange={(v) => update('backgroundColor', v)}
              />
            ) : null}
          </div>
        </div>
      </div>

      {busy ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <span>Saving avatar…</span>
            <span className="tabular-nums text-primary-600 dark:text-primary-400">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface2"
          >
            <div
              className="h-full rounded-full bg-primary-600 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" loading={busy} onClick={() => void handleSave()}>
          Save Avatar
        </Button>
      </div>
    </div>
  );
}
