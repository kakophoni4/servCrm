import {OrderReturnTracker} from '@/components/orders/OrderReturn';
import { AppShell } from '@/components/AppShell';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell><OrderReturnTracker/>{children}</AppShell>;
}
