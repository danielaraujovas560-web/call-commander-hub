import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  defaultValues: ReportFilterValues
) {
  // Tenta ler do localStorage na montagem inicial
  const [filtro, setFiltro] = useState<ReportFilterValues>(() => {
    if (typeof window !== "undefined" && tenantId) {
      const saved = localStorage.getItem(`${key}_${tenantId}`);
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return defaultValues;
  });

  // Reage se o usuário sair da rota e voltar (espera o tenantId carregar)
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

  // MÁGICA PARA AS ABAS: Se o pai mandar um valor novo, atualiza a tela instantaneamente
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
      {showLimit && (
        <div className="space-y-1">
          <Label className="text-xs">Limite</Label>
          <select 
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" 
            value={String(limit)} 
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="150">150</option>
            <option value="200">200</option>
          </select>
        </div>
      )}
      <div className="flex items-end gap-2 md:col-span-3 lg:col-span-4">
        <Button type="submit" size="sm"><Filter className="mr-2 h-4 w-4" />Aplicar</Button>
        <Button type="button" variant="ghost" size="sm" onClick={clear}><X className="mr-2 h-4 w-4" />Limpar</Button>
      </div>
    </form>
  );
}
