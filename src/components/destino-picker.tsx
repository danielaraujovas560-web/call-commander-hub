// Generic destination picker. Reused by URA options, Roteamento, Regra de Horário, etc.
// "Curinga" — extensible via `allow` prop instead of forking per screen.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listUraDestinos } from "@/lib/ramais.functions";
import { displayFromBackend } from "@/lib/format";

export type DestinoTipo =
  | "RAMAL"
  | "FILA"
  | "URA"
  | "EXTERNO"
  | "INTERNO"
  | "AUDIO"
  | "HORARIO_ATENDIMENTO";

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
  allow: readonly DestinoTipo[];
  /** ID da URA atual, para evitar auto-referência ao listar URAs. */
  excludeUraId?: number;
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
            {allow.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
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
                  {displayFromBackend(r.label)} ({r.value})
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
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {value.tipo === "HORARIO_ATENDIMENTO" && (
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
export function renderDestinoLabel(
  data: Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listUraDestinos>>>> | undefined,
  tipo: string,
  destino: string,
): string {
  const t = String(tipo || "").toUpperCase();
  if (!data) return destino;
  if (t === "RAMAL") {
    const r = data.ramais.find((x) => String(x.value) === destino);
    return r ? `${displayFromBackend(r.label)} (${r.value})` : destino;
  }
  if (t === "FILA") return displayFromBackend(data.filas.find((x) => String(x.value) === destino)?.label ?? destino);
  if (t === "URA") return displayFromBackend(data.uras.find((x) => String(x.value) === destino)?.label ?? destino);
  if (t === "HORARIO_ATENDIMENTO")
    return displayFromBackend(data.regras.find((x) => String(x.value) === destino)?.label ?? destino);
  if (t === "INTERNO") return INTERNO_OPTS.find((x) => x.value === destino)?.label ?? destino;
  return destino;
}
