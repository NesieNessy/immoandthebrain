import { PAGE_CONTAINER_CLASS } from "@/components/ui";

const HIGHLIGHTS = [
  { title: "Automatische Kalkulation", body: "Rendite, Cashflow und Mietentwicklung immer aktuell" },
  { title: "Fristen nie verpassen", body: "Mietanpassungen und gesetzliche Grenzen stets im Blick" },
  { title: "Dokumente auf Knopfdruck", body: "Mietvertrag, Mieterbescheinigung, Nebenkostenabrechnung" },
];

const STATS = [
  { value: "2.400+", label: "Objekte verwaltet" },
  { value: "4,3 %", label: "Ø Rendite" },
  { value: "98 %", label: "Zufriedenheit" },
];

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background py-8">
      {/* Capped at the same width as the rest of the app's pages
          (PAGE_CONTAINER_CLASS / .container, 1152px) instead of spanning
          the full viewport. */}
      <div className={PAGE_CONTAINER_CLASS}>
        <div className="flex flex-col lg:flex-row rounded-2xl border border-border shadow-lg overflow-hidden bg-card">
          {/* Marketing panel — hidden below lg, matches the app's brand-navy/gold palette */}
          <div className="hidden lg:flex lg:w-[46%] xl:w-[42%] shrink-0 flex-col justify-between bg-brand-navy text-brand-navy-foreground px-12 py-14">
            <div>
              <h1 className="text-3xl font-bold leading-tight">
                Ihr Immobilienportfolio intelligent verwalten —{" "}
                <span className="text-accent">Renditemaximierung inklusive.</span>
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-navy-foreground/70">
                Bewerten, verwalten und optimieren Sie Ihre Immobilien mit KI-gestützten Vorschlägen, automatischen Fristen und vollständiger Bestandsverwaltung.
              </p>

              <ul className="mt-10 space-y-5">
                {HIGHLIGHTS.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-sm bg-accent" aria-hidden="true" />
                    <p className="text-sm leading-relaxed">
                      <span className="font-semibold">{item.title}</span>
                      <span className="text-brand-navy-foreground/70"> – {item.body}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <div className="text-2xl font-bold text-accent">{stat.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-wide text-brand-navy-foreground/60">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Form panel */}
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
            <div className="w-full max-w-md">
              <div className="mb-10 flex items-center justify-center">
                <img src="/logo-full.svg" alt="ImmoAndTheBrain" className="h-10 w-auto" />
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
