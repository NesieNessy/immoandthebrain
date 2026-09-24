import { Button } from '@/components/ui';
import { totalPages } from './pagination';

export function PaginationFooter({ page, onPageChange, itemCount, pageSize, itemLabel = 'Ergebnisse' }: {
    page: number;
    onPageChange: (page: number) => void;
    itemCount: number;
    pageSize: number;
    itemLabel?: string;
}) {
    const pages = totalPages(itemCount, pageSize);
    return (
        <div className="flex items-center justify-between gap-3 px-1 pt-2">
            <span className="text-sm text-muted-foreground">{itemCount} {itemLabel}</span>
            <div className="flex items-center gap-2">
                <Button label="Zurück" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} />
                <Button label="Weiter" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} />
            </div>
        </div>
    );
}
