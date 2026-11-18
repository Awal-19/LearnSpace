import { createContext, useContext, type ReactNode } from 'react';

/**
 * Prefix for in-app links. Empty in the real app; "/dev/shell" in the dev-only
 * layout preview, so sidebar links stay inside the preview.
 */
const BasePathContext = createContext('');

export function BasePathProvider({ base, children }: { base: string; children: ReactNode }) {
  return <BasePathContext.Provider value={base}>{children}</BasePathContext.Provider>;
}

export function useAppPath(): (path: string) => string {
  const base = useContext(BasePathContext);
  return (path: string) => (path === '/' ? base || '/' : `${base}${path}`);
}
