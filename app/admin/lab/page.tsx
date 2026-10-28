import type { Metadata } from 'next';
import LabClient from './LabClient';

export const metadata: Metadata = { title: 'Engine lab' };

// Phase 1 runs on your own computer, so the lab has no sign-in yet.
// Everything under /admin gets the owner sign-in in phase 4.
export default function LabPage() {
  return <LabClient />;
}
