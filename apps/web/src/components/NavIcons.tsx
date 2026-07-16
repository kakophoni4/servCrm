import type { ReactNode } from 'react';

type IconProps = { className?: string };

function Svg({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Чаты */
export function IconChat({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

/** Заявки и клиенты */
export function IconOrders({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </Svg>
  );
}

/** Касса и ресурсы */
export function IconCash({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </Svg>
  );
}

/** Отчёты */
export function IconReports({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16v-5M12 16V8M16 16v-3" />
    </Svg>
  );
}

/** Настройки */
export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

/** Аккаунт */
export function IconAccount({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

const BY_HREF: Record<string, (p: IconProps) => ReactNode> = {
  '/chat': IconChat,
  '/orders': IconOrders,
  '/cash': IconCash,
  '/reports': IconReports,
  '/settings/cities': IconSettings,
  '/settings/account': IconAccount,
};

export function NavIcon({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const Icon = BY_HREF[href];
  if (!Icon) return null;
  return <Icon className={className} />;
}
