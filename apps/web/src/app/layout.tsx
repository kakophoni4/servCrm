import type { Metadata, Viewport } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'СРМ Сервис',
  description: 'CRM для сервисного бизнеса — замена Битрикса',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const themeBootScript = `
(function(){
  try {
    var p = localStorage.getItem('crm_theme') || 'system';
    var dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var r = p === 'dark' || (p === 'system' && dark) ? 'dark' : 'light';
    document.documentElement.dataset.theme = r;
    document.documentElement.dataset.themePref = p;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
