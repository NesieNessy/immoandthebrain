import type { Metadata } from "next";
import { AppNavigation } from '@/components/features/AppNavigation';
import { ToastProvider } from '@/components/ui';
import "../styles/index.css";

export const metadata: Metadata = {
  title: "ImmoAndTheBrain - Real Estate Management Platform",
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
          {/* AppNavigation is fixed (see NavigationBar) — this spacer reserves
              its h-16 height in normal flow so content doesn't start underneath
              it. The page scrolls normally; nav bar and (per-page) breadcrumb
              stay pinned via fixed/sticky positioning, not a custom scroll
              container — the same proven approach StickyActionBar already
              uses at the bottom. */}
          <div className="h-16" aria-hidden="true" />
          <AppNavigation />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
