import type { Metadata } from 'next';
import { AppShell } from '@/components/shell/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'Relay Support Intelligence',
  description:
    'A prototype internal employee-support orchestration and product-intelligence layer. All data is synthetic.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#workspace"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:bg-surface-raised focus:px-3 focus:py-2"
        >
          Skip to workspace
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
