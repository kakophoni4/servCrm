'use client';

import { ClaimsPanel } from '@/components/desk/ClaimsPanel';
import { ClientsPanel } from '@/components/desk/ClientsPanel';
import { OrdersPanel } from '@/components/desk/OrdersPanel';

export default function OrdersPage() {
  return (
    <div>
      <h1 className="page-title">Заявки и клиенты</h1>
      <div className="desk-grid">
        <OrdersPanel />
        <ClientsPanel />
        <ClaimsPanel />
      </div>
    </div>
  );
}
