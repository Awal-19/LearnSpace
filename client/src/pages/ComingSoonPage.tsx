import type { LucideIcon } from 'lucide-react';
import { Hourglass } from 'lucide-react';
import { EmptyState } from '../design';

interface ComingSoonPageProps {
  /** Feature name, e.g. "AI Assistant". */
  feature: string;
  /** Roadmap phase that delivers it (see docs/ROADMAP.md). */
  phase: number;
  description: string;
  icon?: LucideIcon;
}

/** Honest route stub for features that land in a later roadmap phase. Contains no fake data. */
export function ComingSoonPage({ feature, phase, description, icon = Hourglass }: ComingSoonPageProps) {
  return (
    <EmptyState
      icon={icon}
      title={`${feature} is coming in Phase ${phase}`}
      description={description}
    />
  );
}

