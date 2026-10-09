'use client';
import { createContext, useContext } from 'react';

/**
 * Data saver (Profile → Data & connection): no live updates or presence until asked
 * (each screen's "Retry" turns them on), and initials instead of profile photos.
 */
const Ctx = createContext(false);
export function DataSaverProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={enabled}>{children}</Ctx.Provider>;
}
export const useDataSaver = () => useContext(Ctx);
