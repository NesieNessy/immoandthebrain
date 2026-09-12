"use client";

import { Icons } from "@/components/common";
import { cn } from "@/lib/utils";
import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc" | null;

export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  width?: string;
  sortable?: boolean;
  /** Show a filter input below this column header */
  filterable?: boolean;
  /**
   * When set alongside `filterable`, renders a dropdown (with a leading
   * "Alle" option) instead of a free-text filter input.
   */
  filterOptions?: { value: string; label: string }[];
  /** Custom cell renderer. Receives the raw value and the full row object. */
  renderCell?: (value: unknown, row: T) => React.ReactNode;
  /** Alignment for header + cells */
  align?: "left" | "center" | "right";
}

export interface TableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  columns: TableColumn<T>[];
  data: T[];
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Sort state */
  sortKey?: string;
  sortDirection?: SortDirection;
  onSort?: (key: string) => void;
  /** Per-column filter values: { [columnKey]: filterString } */
  columnFilters?: Record<string, string>;
  onColumnFilterChange?: (key: string, value: string) => void;
  /** Footer left text, e.g. "5 Einträge" (meaning "5 entries") */
  footerLeft?: React.ReactNode;
  /** Footer right text */
  footerRight?: React.ReactNode;
  /** Show footer bar — defaults to true */
  showFooter?: boolean;
  /** Optional extra class names per row — receives the row object and index */
  getRowClassName?: (row: T, index: number) => string | undefined;
  className?: string;
  emptyMessage?: string;
  /**
   * When provided, renders one of these per row in place of the `<table>`
   * below the `md` breakpoint — a mobile card list instead of a horizontally-
   * scrolling table. The caller owns the card's markup entirely; Table only
   * handles the responsive switch, spacing, and empty state.
   */
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  /**
   * Rows per page. Omit to disable pagination entirely (all rows render at
   * once, as before). When set, the table body scrolls vertically within a
   * fixed max height, the header stays pinned, and page controls (with a
   * rows-per-page picker) render in the footer. The user can still change
   * the page size via that picker; this is only the initial value.
   */
  pageSize?: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SortIcon({
  columnKey,
  sortKey,
  sortDirection,
}: {
  columnKey: string;
  sortKey?: string;
  sortDirection?: SortDirection;
}) {
  if (sortKey !== columnKey || !sortDirection) {
    return <Icons.ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />;
  }
  return sortDirection === "asc" ? (
    <Icons.ChevronUp className="w-3.5 h-3.5 shrink-0" />
  ) : (
    <Icons.ChevronDown className="w-3.5 h-3.5 shrink-0" />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Table<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  sortKey,
  sortDirection,
  onSort,
  columnFilters = {},
  onColumnFilterChange,
  footerLeft,
  footerRight,
  showFooter = true,
  className,
  emptyMessage = "Keine Einträge vorhanden.",
  getRowClassName,
  renderMobileCard,
  pageSize,
}: TableProps<T>) {

  const hasFilterRow = columns.some((c) => c.filterable);

  // ── Pagination ───────────────────────────────────────────────────────
  const paginationEnabled = pageSize !== undefined;
  const [page, setPage] = React.useState(1);
  const [rowsPerPage, setRowsPerPage] = React.useState(pageSize ?? data.length);

  // A new filtered/sorted result set (or a page-size change) always starts
  // back at page 1 — an out-of-range page would otherwise render nothing.
  React.useEffect(() => {
    setPage(1);
  }, [data, rowsPerPage]);

  const totalPages = paginationEnabled ? Math.max(1, Math.ceil(data.length / rowsPerPage)) : 1;
  const currentPage = Math.min(page, totalPages);
  const pageData = paginationEnabled
    ? data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
    : data;

  // ── Alignment helper ──────────────────────────────────────────────────
  const alignClass = (align?: "left" | "center" | "right") => {
    if (align === "center") return "text-center";
    if (align === "right") return "text-right";
    return "text-left";
  };

  return (
    <div
      className={cn(
        "w-full flex flex-col",
        renderMobileCard
          ? "md:border md:border-border md:rounded-xl md:overflow-hidden"
          : "border border-border rounded-xl overflow-hidden",
        className
      )}
    >
      {/* ── Scrollable table area — hidden on mobile when a card renderer is given ── */}
      <div
        className={cn(
          "w-full overflow-x-auto",
          // Fixed regardless of the selected page size — otherwise switching
          // "Zeilen pro Seite" between 10/25/50 resized the table on every
          // change. Tall enough to fit 10 full rows (plus header and, where
          // present, the filter row) without an inner scrollbar; 25/50 just
          // scroll within this same fixed viewport instead of growing it.
          paginationEnabled && "max-h-[680px] overflow-y-auto",
          renderMobileCard && "hidden md:block"
        )}
      >
        {/* border-separate (not border-collapse) — sticky positioning on
            <thead> is unreliable with collapsed table borders in several
            browsers, which otherwise let the header scroll away with the
            body instead of staying pinned while only the rows scroll.
            table-layout: fixed — without it, a column's `width` is only a
            hint the browser's auto-layout algorithm can override based on
            cell content (most visibly, a form control's w-full resolves
            against an as-yet-undetermined column width, so it renders
            smaller than the declared width instead of filling it). Fixed
            layout makes `width` authoritative and splits the remainder
            evenly across columns that don't specify one. */}
        <table className="w-full border-separate border-spacing-0 table-fixed">
          <thead className={cn(paginationEnabled && "sticky top-0 z-10")}>
            {/* ── Sort / label row ──────────────────────────────────── */}
            <tr className="bg-primary/8 border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={cn(
                    "px-4 py-3 text-sm font-semibold whitespace-nowrap",
                    alignClass(col.align),
                    col.sortable &&
                      "cursor-pointer select-none hover:opacity-80 transition-opacity"
                  )}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.label}
                    {col.sortable && (
                      <SortIcon
                        columnKey={col.key}
                        sortKey={sortKey}
                        sortDirection={sortDirection}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>

            {/* ── Filter row — only rendered if at least one column has filterable ──
                 Solid (not translucent) so the sticky header can't let a
                 scrolled-past row show through it. ── */}
            {hasFilterRow && (
              <tr className="bg-primary/8 border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn("px-2 py-2", alignClass(col.align))}
                  >
                    {col.filterable && col.filterOptions ? (
                      <select
                        value={columnFilters[col.key] ?? ""}
                        onChange={(e) => onColumnFilterChange?.(col.key, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "w-full px-2 py-1 text-xs bg-background border border-border rounded-md cursor-pointer",
                          "focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary",
                          "text-foreground transition-colors"
                        )}
                      >
                        <option value="">Alle</option>
                        {col.filterOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : col.filterable ? (
                      <div className="relative">
                        <input
                          type="text"
                          value={columnFilters[col.key] ?? ""}
                          onChange={(e) =>
                            onColumnFilterChange?.(col.key, e.target.value)
                          }
                          placeholder="Filter…"
                          className={cn(
                            "w-full px-2 py-1 pr-6 text-xs bg-background border border-border rounded-md",
                            "focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary",
                            "text-foreground placeholder:text-muted-foreground transition-colors"
                          )}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {columnFilters[col.key] && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onColumnFilterChange?.(col.key, "");
                            }}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label="Filter leeren"
                          >
                            <Icons.Close className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>

          {/* ── Body ──────────────────────────────────────────────── */}
          <tbody className="bg-card divide-y divide-border">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pageData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-primary/5",
                    getRowClassName?.(row, rowIndex)
                  )}
                  onClick={() => onRowClick?.(row, rowIndex)}
                >
                  {columns.map((col) => {
                    const raw = row[col.key];
                    return (
                      <td
                        key={col.key}
                        className={cn(
                          // overflow-hidden text-ellipsis — a defensive fallback
                          // for columns whose renderCell doesn't already
                          // truncate its own content: with table-fixed a
                          // column's width is authoritative, so unclipped
                          // overflow-x content would otherwise visually bleed
                          // into the next cell instead of the column growing
                          // to fit it (the old auto-layout behavior).
                          "px-4 py-4 text-sm text-foreground whitespace-nowrap overflow-hidden text-ellipsis",
                          alignClass(col.align)
                        )}
                      >
                        {col.renderCell ? col.renderCell(raw, row) : String(raw ?? "—")}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile card list — only rendered when a card renderer is given ── */}
      {renderMobileCard && (
        <div className="md:hidden flex flex-col gap-3 p-3">
          {data.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-10">{emptyMessage}</p>
          ) : (
            pageData.map((row, rowIndex) => (
              <div key={rowIndex}>{renderMobileCard(row, rowIndex)}</div>
            ))
          )}
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      {showFooter && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border bg-card text-xs text-muted-foreground">
          <span>{footerLeft}</span>

          {paginationEnabled && data.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                Zeilen pro Seite
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="px-1.5 py-1 bg-background border border-border rounded-md cursor-pointer
                             focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary
                             text-foreground transition-colors"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </label>

              <span>Seite {currentPage} von {totalPages}</span>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Vorherige Seite"
                  className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Icons.ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Nächste Seite"
                  className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Icons.ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <span>{footerRight}</span>
        </div>
      )}
    </div>
  );
}
