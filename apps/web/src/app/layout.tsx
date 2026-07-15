import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Field CRM',
  description: 'CRM для сервисного бизнеса — замена Битрикса',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
