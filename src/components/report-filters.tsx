import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X } from "lucide-react";

export interface ReportFilterValues {
  linkedid?: string;
  origem?: string;
  destino?: string;
  status?: string;
  tipo?: string;
  fila?: string;
  from?: string;
  to?: string;
  limit?: number;
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
  }>;
}

// ==========================================
// 1. HOOK CENTRALIZADO PARA O PAI USAR
// ==========================================
export function usePersistentFilter(
  key: string,
  tenantId: string | number | undefined,
  defaultValues: ReportFilterValues,
) {
  const [filtro, setFiltro] = useState<ReportFilterValues>(() => {
    if (typeof window !== "undefined" && tenantId) {
      const saved = localStorage.getItem(`${key}_${tenantId}`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return defaultValues;
  });

  useEffect(() => {
    if (!tenantId) return;

    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`${key}_${tenantId}`);
      if (saved) {
        try {
          setFiltro(JSON.parse(saved));
          return;
        } catch (e) {}
      }
    }
    setFiltro(defaultValues);
  }, [tenantId, key]);

  return [filtro, setFiltro] as const;
}

// ==========================================
// 2. COMPONENTE DE FILTRO (VISUAL)
// ==========================================
interface ReportFiltersProps {
  fields: FieldConfig[];
  onApply: (v: ReportFilterValues) => void;
  showLimit?: boolean;
  initialValues?: ReportFilterValues;
  defaultValues?: ReportFilterValues;
  storageKey?: string;
  tenantId?: string | number;
}

export function ReportFilters({
  fields,
  onApply,
  showLimit = true,
  initialValues,
  defaultValues,
  storageKey,
  tenantId,
}: ReportFiltersProps) {
  const [values, setValues] = useState<ReportFilterValues>(initialValues || {});
  const [limit, setLimit] = useState(initialValues?.limit || 25);

  useEffect(() => {
    if (initialValues) {
      setValues(initialValues);
      if (initialValues.limit) setLimit(initialValues.limit);
    }
  }, [initialValues]);

  const set = (k: FilterKey, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const handleApply = (newVals: ReportFilterValues) => {
    const finalVals = showLimit ? { ...newVals, limit } : newVals;

    if (storageKey && tenantId && typeof window !== "undefined") {
      localStorage.setItem(`${storageKey}_${tenantId}`, JSON.stringify(finalVals));
    }
    onApply(finalVals);
  };

  const clear = () => {
    const resetVals = defaultValues || {};
    setValues(resetVals);
    setLimit(25);

    if (storageKey && tenantId && typeof window !== "undefined") {
      localStorage.removeItem(`${storageKey}_${tenantId}`);
    }

    const finalVals = showLimit ? { ...resetVals, limit: 25 } : resetVals;
    onApply(finalVals);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleApply(values);
      }}
      className="rounded-md border bg-card p-3 grid gap-3 md:grid-cols-3 lg:grid-cols-4"
    >
      {fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <Label className="text-xs">{f.label}</Label>
          {f.options ? (
            <Select
              value={values[f.key] ? String(values[f.key]) : "all"}
              onValueChange={(val) => set(f.key, val === "all" ? "" : val)}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

      {showLimit && (
        <div className="space-y-1">
          <Label className="text-xs">Limite</Label>
          <Select
            value={String(limit)}
            onValueChange={(val) => setLimit(Number(val))}
          >
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="150">150</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
        <Button type="submit" size="sm">
          <Filter className="mr-2 h-4 w-4" />
          Aplicar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clear}>
          <X className="mr-2 h-4 w-4" />
          Limpar
        </Button>
      </div>
    </form>
  );
}
