import type { Metadata } from "next";
import { AppNavigation } from '@/components/features/AppNavigation';
import { SessionExpiredDialog } from '@/components/features/SessionExpiredDialog';
import { ToastProvider } from '@/components/ui';
import "../styles/index.css";

export const metadata: Metadata = {
  title: "ImmoAndTheBrain",
  description: "Modern real estate management platform for customers and properties",
  keywords: ["real estate", "property management", "immoandthebrain"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="antialiased bg-background text-foreground">
        <ToastProvider>
          {/* AppNavigation renders its own h-16 spacer alongside the fixed
              nav bar (see NavigationBar) — together they disappear on public
              routes like /login, where there's no app chrome to reserve
              space for. The page scrolls normally; nav bar and (per-page)
              breadcrumb stay pinned via fixed/sticky positioning, not a
              custom scroll container — the same proven approach
              StickyActionBar already uses at the bottom. */}
          <AppNavigation />
          {children}
          <SessionExpiredDialog />

        </ToastProvider>
      </body>
    </html>
  );
}
