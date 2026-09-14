import { Icons } from '@/components/common/Icons';
import { Tile } from '@/components/ui/Tile';
import { FieldLabels } from '@/constants/FieldLabels';
import { cn } from '@/lib/utils';
import { calcPositionPct, classifyKpf, KPF_SCALE_MAX, KPF_SCALE_MIN } from '@/lib/quickCheck/kpf';

interface Props {
  street:             string;
  postalCode:         string;
  city:               string;
  purchasePrice:      number;
  coldRent:           number;
  condition:          string;
  yearOfConstruction: string | number;
  kpf:                number | null;
  className?:         string;
}

export function KpfAssessmentCard({
  street, postalCode, city, purchasePrice, coldRent, condition, yearOfConstruction,
  kpf, className,
}: Props) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {/* Address line */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icons.MapPin className="w-4 h-4 shrink-0" />
        <span>{`${street}, ${postalCode} ${city}`}</span>
      </div>

      {kpf !== null && (
        <KpfDetails
          kpf={kpf}
          purchasePrice={purchasePrice}
          coldRent={coldRent}
          condition={condition}
          yearOfConstruction={yearOfConstruction}
        />
      )}
    </div>
  );
}

/** Everything below the address line — only rendered once `kpf` is known,
 *  so classification/position are computed from a non-nullable `kpf` here
 *  instead of every caller re-checking it alongside `kpf !== null`. */
function KpfDetails({
  kpf, purchasePrice, coldRent, condition, yearOfConstruction,
}: {
  kpf: number;
  purchasePrice: number;
  coldRent: number;
  condition: string;
  yearOfConstruction: string | number;
}) {
  const rendite = purchasePrice > 0 ? (coldRent * 12 / purchasePrice) * 100 : null;
  const positionPct = calcPositionPct(kpf, KPF_SCALE_MIN, KPF_SCALE_MAX);
  const classification = classifyKpf(kpf);

  return (
    <>
      {/* Info banner */}
      <div className="flex items-start gap-3 px-4 py-3 bg-info/10 border border-info/30 rounded-lg">
        <Icons.AlertCircle className="w-5 h-5 text-info shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-info">Marktüblicher Kaufpreisfaktor</p>
          <p className="text-sm text-info/90 mt-0.5">
            Faktor {kpf.toFixed(1)}
            {rendite !== null && ` · Rendite ${rendite.toFixed(2)} % p.a.`}
          </p>
        </div>
      </div>

      {/* Stat grid */}
      <Tile title="">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {FieldLabels.AcquisitionCosts.PurchasePrice.de}
            </p>
            <p className="text-sm font-semibold text-foreground">{purchasePrice.toLocaleString('de-DE')} €</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {FieldLabels.Tenancy.ColdRent.de}
            </p>
            <p className="text-sm font-semibold text-foreground">{coldRent.toLocaleString('de-DE')} €</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Zustand</p>
            <p className="text-sm font-semibold text-foreground">{condition || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              {FieldLabels.Property.YearOfConstruction.de}
            </p>
            <p className="text-sm font-semibold text-foreground">{yearOfConstruction || '—'}</p>
          </div>
        </div>
      </Tile>

      {/* Factor value + fixed-scale gauge */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Kaufpreisfaktor
          </span>
          <span className="text-2xl font-semibold text-foreground">{kpf.toFixed(1)}</span>
        </div>

        {/* Arrow above the bar, pointing down at the calculated KPF's position */}
        <div className="relative h-4">
          <div
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `${positionPct}%` }}
            title={`Dein KPF: ${kpf.toFixed(1)}`}
          >
            <Icons.ArrowDown className="w-4 h-4 text-foreground" />
          </div>
        </div>

        <div className="relative h-3 w-full rounded-full overflow-visible">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: 'linear-gradient(to right, var(--success), var(--warning), var(--destructive))' }}
          />
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-muted-foreground">{KPF_SCALE_MIN}</span>
          <span className="text-xs text-muted-foreground">{KPF_SCALE_MAX}</span>
        </div>
      </div>

      {/* Recommendation */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Einschätzung</h3>
        <p className="text-sm text-muted-foreground">{classification.description}</p>
      </div>
    </>
  );
}
