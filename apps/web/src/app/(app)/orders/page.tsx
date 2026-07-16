'use client';

import { DeskShell } from '@/components/desk/DeskShell';
import { OrdersPanel } from '@/components/desk/OrdersPanel';

export default function OrdersPage() {
  return (
    <DeskShell>
      <OrdersPanel />
    </DeskShell>
  );
}
