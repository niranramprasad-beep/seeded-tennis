import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SeededTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Numeric columns render in mono/tabular-nums by default. */
  numeric?: boolean;
  render: (row: T) => ReactNode;
}

interface SeededTableProps<T> {
  columns: SeededTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  className?: string;
}

// Generic data table, consistent with the Seeded token system — no exact
// mockup spec exists yet (Schools.dc.html in Phase 4 has the real one).
export function SeededTable<T>({ columns, rows, rowKey, className }: SeededTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto rounded-[10px] border border-line bg-card", className)}>
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-stone">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-2.5 font-semibold",
                  col.align === "right" && "text-right"
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-b border-line last:border-0 hover:bg-cream/60">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "whitespace-nowrap px-4 py-2.5 text-ink",
                    col.align === "right" && "text-right",
                    col.numeric && "font-mono tabular-nums"
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
