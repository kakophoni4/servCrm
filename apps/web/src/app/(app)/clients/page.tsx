'use client';

import { ClientsPanel } from '@/components/desk/ClientsPanel';
import { DeskShell } from '@/components/desk/DeskShell';

export default function ClientsPage() {
  return (
    <DeskShell>
      <ClientsPanel />
    </DeskShell>
  );
}
