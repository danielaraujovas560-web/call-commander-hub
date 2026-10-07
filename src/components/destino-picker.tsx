// Generic destination picker. Reused by URA options, Roteamento, Regra de Horário, etc.
// "Curinga" — extensible via `allow` prop instead of forking per screen.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listUraDestinos } from "@/lib/uras.functions";
import { displayFromBackend } from "@/lib/format";

export type DestinoTipo =
  "RAMAL" | "FILA" | "URA" | "EXTERNO" | "INTERNO" | "AUDIO" | "REGRA_HORARIO";

export type DestinoValue = {
  tipo: DestinoTipo | "";
  destino: string;
  externoNumero: string;
  externoTronco: string;
};

export const emptyDestino: DestinoValue = {
  tipo: "",
  destino: "",
  externoNumero: "",
  externoTronco: "",
};

export function parseDestinoFromBackend(tipo: string, destino: string): DestinoValue {
  const t = String(tipo || "").toUpperCase() as DestinoTipo;
  if (t === "EXTERNO" && destino.includes("/")) {
    const [n, tr] = destino.split("/");
    return { tipo: t, destino: "", externoNumero: n, externoTronco: tr };
  }
  return { tipo: t, destino, externoNumero: "", externoTronco: "" };
}

export function buildDestinoForBackend(v: DestinoValue): string {
  if (v.tipo === "EXTERNO") return `${v.externoNumero}/${v.externoTronco}`;
  return v.destino;
}

export function isDestinoIncomplete(v: DestinoValue): boolean {
  if (!v.tipo) return true;
  if (v.tipo === "EXTERNO") return !v.externoNumero || !v.externoTronco;
  return !v.destino;
}

const INTERNO_OPTS = [
  { value: "desligar", label: "Desligar" },
  { value: "repetir", label: "Repetir" },
];

type Props = {
  tenantId: number;
  value: DestinoValue;
  onChange: (v: DestinoValue) => void;
  /** Tipos permitidos, na ordem em que devem aparecer no select. */
  allow: readonly { value: DestinoTipo; label: string }[];
  /** ID da URA atual, para evitar auto-referência ao listar URAs. */
  excludeUraId?: string;
  compact?: boolean;
};

export function DestinoPicker({ tenantId, value, onChange, allow, excludeUraId, compact }: Props) {
  const fn = useServerFn(listUraDestinos);
  const { data } = useQuery({
    queryKey: ["ura-destinos", tenantId],
    queryFn: () => fn({ data: { tenant_id: tenantId } }),
  });

  const setTipo = (t: DestinoTipo) => onChange({ ...emptyDestino, tipo: t });

  return (
    <div className={compact ? "grid grid-cols-2 gap-2" : "space-y-2"}>
      <div className="space-y-1">
        <Label className="text-xs">Ação</Label>
        <Select value={value.tipo} onValueChange={(v: DestinoTipo) => setTipo(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {allow.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Destino</Label>
        {!value.tipo && <Input disabled placeholder="Escolha a ação primeiro" />}

        {value.tipo === "RAMAL" && (
          <Select value={value.destino} onValueChange={(v) => onChange({ ...value, destino: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o ramal" />
            </SelectTrigger>
            <SelectContent>
              {(data?.ramais ?? []).map((r) => (
                <SelectItem key={r.value} value={String(r.value)}>
                  {displayFromBackend(r.label)} ({r.ramal})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "FILA" && (
          <Select value={value.destino} onValueChange={(v) => onChange({ ...value, destino: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a fila" />
            </SelectTrigger>
            <SelectContent>
              {(data?.filas ?? []).map((f) => (
                <SelectItem key={f.value} value={String(f.value)}>
                  {displayFromBackend(f.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "URA" && (
          <Select value={value.destino} onValueChange={(v) => onChange({ ...value, destino: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a URA" />
            </SelectTrigger>
            <SelectContent>
              {(data?.uras ?? [])
                .filter((u) => u.value !== excludeUraId)
                .map((u) => (
                  <SelectItem key={u.value} value={String(u.value)}>
                    {displayFromBackend(u.label)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "INTERNO" && (
          <Select value={value.destino} onValueChange={(v) => onChange({ ...value, destino: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Função" />
            </SelectTrigger>
            <SelectContent>
              {INTERNO_OPTS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "AUDIO" && (
          <Select value={value.destino} onValueChange={(v) => onChange({ ...value, destino: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o áudio" />
            </SelectTrigger>
            <SelectContent>
              {(data?.audios ?? []).map((a) => (
                <SelectItem key={String(a.value)} value={String(a.value)}>
                  {displayFromBackend(a.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "REGRA_HORARIO" && (
          <Select value={value.destino} onValueChange={(v) => onChange({ ...value, destino: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a regra" />
            </SelectTrigger>
            <SelectContent>
              {(data?.regras ?? []).map((r) => (
                <SelectItem key={r.value} value={String(r.value)}>
                  {displayFromBackend(r.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "EXTERNO" && (
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={value.externoNumero}
              onChange={(e) => onChange({ ...value, externoNumero: e.target.value })}
              placeholder="Número"
            />
            <Select
              value={value.externoTronco}
              onValueChange={(v) => onChange({ ...value, externoTronco: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tronco" />
              </SelectTrigger>
              <SelectContent>
                {(data?.troncos ?? []).map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

/** Render label of a saved (tipo, destino) tuple using the same lookup lists. */
export function renderDestinoLabel(destinosData: any, tipo?: string, destino?: string): string {
  if (!tipo || !destino) return "-";

  const t = tipo.toUpperCase();

  switch (t) {
    case "RAMAL": {
      const item = destinosData?.ramais?.find((r: any) => String(r.value) === String(destino));
      // Exibe: "João Silva (1001)" ou apenas o label
      return item ? `${item.label} (${item.ramal})` : destino;
    }

    case "FILA": {
      const item = destinosData?.filas?.find((f: any) => String(f.value) === String(destino));
      return item ? item.label : destino;
    }

    case "URA": {
      const item = destinosData?.uras?.find((u: any) => String(u.value) === String(destino));
      return item ? item.label : destino;
    }

    case "REGRA_HORARIO":
    case "REGRA": {
      const item = destinosData?.regras?.find((reg: any) => String(reg.value) === String(destino));
      return item ? item.label : destino;
    }

    case "TRONCO": {
      const item = destinosData?.troncos?.find((tr: any) => String(tr.value) === String(destino));
      return item ? item.label : destino;
    }

    case "AUDIO": {
      const item = destinosData?.audios?.find((a: any) => String(a.value) === String(destino));
      return item ? item.label : destino;
    }

    case "INTERNO": {
      if (destino === "desligar") return "Desligar";
      if (destino === "repetir") return "Repetir";
      return destino;
    }

    case "EXTERNO":
      return `Número Externo: ${destino}`;

    default:
      return destino;
  }
}
