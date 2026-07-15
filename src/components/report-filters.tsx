import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Filter, X } from "lucide-react";

export interface ReportFilterValues {
  linkedid?: string;
  origem?: string;
  destino?: string;
  status?: string;
  fila?: string;
  from?: string;
  to?: string;
}

export type FilterKey = keyof ReportFilterValues;

export interface FieldConfig {
  key: FilterKey;
  label: string;
  placeholder?: string;
  type?: "text" | "datetime-local";
  options?: ReadonlyArray<{
    value: string;
    label: string;
  }>; // if provided, render as <select>
}

export function ReportFilters({
  fields,
  onApply,
}: {
  fields: FieldConfig[];
  onApply: (v: ReportFilterValues) => void;
}) {
  const [values, setValues] = useState<ReportFilterValues>({});
  const set = (k: FilterKey, v: string) => setValues((s) => ({ ...s, [k]: v }));
  const clear = () => { setValues({}); onApply({}); };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onApply(values); }}
      className="rounded-md border bg-card p-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4"
    >
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label className="text-xs">{f.label}</Label>
          {f.options ? (
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            >
              <option value="">Todos</option>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <Input
              type={f.type ?? "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => set(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
      <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
        <Button type="submit" size="sm"><Filter className="mr-2 h-4 w-4" />Aplicar</Button>
        <Button type="button" variant="ghost" size="sm" onClick={clear}><X className="mr-2 h-4 w-4" />Limpar</Button>
      </div>
    </form>
  );
}
