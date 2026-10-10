import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Workflow,
  RefreshCw,
  ListTree,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";

import {
  listUras,
  createUra,
  updateUra,
  deleteUra,
  addUraOpcao,
  updateUraOpcao,
  deleteUraOpcao,
  listUraDestinos,
  toggleUraAtivo,
  type Ura,
} from "@/lib/uras.functions";

import { listAudios } from "@/lib/audios.functions";
import { listIa } from "@/lib/ia.functions";
import { displayFromBackend } from "@/lib/format";

import {
  DestinoPicker,
  buildDestinoForBackend,
  isDestinoIncomplete,
  type DestinoValue,
} from "@/components/destino-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ToggleAtivoBadge } from "@/components/toggle-ativo-badge";
import { useClienteContext } from "./_cliente-context";

export const Route = createFileRoute(
  "/_authenticated/cliente/uras",
)({
  head: () => ({
    meta: [{ title: "URAs — Cliente — Painel PABX" }],
  }),
  component: UrasPage,
});

const ALLOWED_DESTINOS_URA = [
  { value: "RAMAL", label: "Ramal" },
  { value: "FILA", label: "Fila" },
  { value: "URA", label: "URA" },
  { value: "EXTERNO", label: "Número Externo" },
  { value: "INTERNO", label: "Ação Interna" },
] as const;

const TIPOS_INTERNOS = [
  { value: "desligar", label: "Desligar" },
  { value: "repetir", label: "Repetir" },
];

function UrasPage() {
  const { tenantId, cliente } = useClienteContext();

  const fn = useServerFn(listUras);

  const qc = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["uras", tenantId],
    queryFn: () =>
      fn({
        data: {
          tenant_id: tenantId,
        },
      }),
    enabled: !!tenantId,
  });

  const uras = Array.isArray(data?.uras)
    ? data.uras
    : [];

  const max = cliente?.quantidade_uras ?? 0;

  const [selected, setSelected] =
    useState<Ura | null>(null);

  const [editing, setEditing] =
    useState<Ura | null>(null);

  const delFn = useServerFn(deleteUra);

  const delMut = useMutation({
    mutationFn: (ura_identifier: string) =>
      delFn({
        data: {
          ura_identifier,
          tenant_id: tenantId,
        },
      }),

    onSuccess: () => {
      toast.success("URA removida");

      qc.invalidateQueries({
        queryKey: ["uras", tenantId],
      });
    },

    onError: (e: Error) =>
      toast.error(e.message),
  });

  const toggleUraAtivoFn =
    useServerFn(toggleUraAtivo);

  const toggleAtivoMut = useMutation({
    mutationFn: ({
      ura_identifier,
      ativo,
    }: {
      ura_identifier: string;
      ativo: boolean;
    }) =>
      toggleUraAtivoFn({
        data: {
          ura_identifier,
          ativo,
          tenant_id: tenantId,
        },
      }),

    onSuccess: () => {
      toast.success("URA atualizada");

      qc.invalidateQueries({
        queryKey: ["uras", tenantId],
      });
    },

    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const count = uras.length;
  const atLimit =
    max > 0 && count >= max;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Workflow className="h-6 w-6" />
            URAs
          </h1>

          <p className="text-sm text-muted-foreground">
            {count}{" "}
            {max > 0 ? `/ ${max}` : ""}{" "}
            uras cadastradas.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={
                isFetching
                  ? "h-4 w-4 animate-spin"
                  : "h-4 w-4"
              }
            />
          </Button>

          <UraFormDialog
            tenantId={tenantId}
            disabled={atLimit}
          />
        </div>
      </div>

      {atLimit && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
          Limite de {max}{" "}
          {max === 1 ? "URA" : "URAs"} atingido
          para este cliente.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Configuração</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead className="text-right">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  Carregando…
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              uras.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-10 text-center text-muted-foreground"
                  >
                    Nenhuma URA cadastrada.
                  </TableCell>
                </TableRow>
              )}

            {uras.map((u) => (
              <TableRow
                key={u.ura_identifier}
                className={
                  u.ativo
                    ? ""
                    : "opacity-60"
                }
              >
                <TableCell
                  className={
                    u.ativo
                      ? ""
                      : "text-muted-foreground"
                  }
                >
                  {u.nome}
                </TableCell>

                <TableCell>
                  <Badge variant="outline">
                    {u.tipo}
                  </Badge>
                </TableCell>

                <TableCell>
                  {u.tipo === "IA" ? (
                    <div className="space-y-0.5">
                      <div className="font-medium">
                        IA:{" "}
                        {u.ia_id ?? "-"}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        Saudação configurada
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      <div className="font-mono text-xs">
                        {u.audio || "-"}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {u.max_digits ?? "-"} dígito(s)
                        {" · "}
                        {u.tentativas ?? "-"} tentativa(s)
                        {" · "}
                        {u.timeout ?? "-"}s
                      </div>
                    </div>
                  )}
                </TableCell>

                <TableCell>
                  <ToggleAtivoBadge
                    ativo={u.ativo}
                    isPending={
                      toggleAtivoMut.isPending
                    }
                    onToggle={() => {
                      toggleAtivoMut.mutate({
                        ura_identifier:
                          u.ura_identifier,
                        ativo: !u.ativo,
                      });
                    }}
                  />
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelected(u)
                      }
                    >
                      <ListTree className="h-4 w-4 mr-1" />
                      Opções
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEditing(u)
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>

                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remover URA{" "}
                            {u.nome}?
                          </AlertDialogTitle>

                          <AlertDialogDescription>
                            Também remove todas as
                            opções configuradas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            Cancelar
                          </AlertDialogCancel>

                          <AlertDialogAction
                            onClick={() =>
                              delMut.mutate(
                                u.ura_identifier,
                              )
                            }
                          >
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <UraOpcoesDialog
          tenantId={tenantId}
          ura={
            uras.find(
              (u) =>
                u.ura_identifier ===
                selected.ura_identifier,
            ) ?? selected
          }
          onClose={() =>
            setSelected(null)
          }
        />
      )}

      {editing && (
        <UraFormDialog
          tenantId={tenantId}
          disabled={false}
          ura={editing}
          open
          onOpenChange={(v) =>
            !v && setEditing(null)
          }
        />
      )}
    </div>
  );
}

// ---------- Form ----------

type UraFormState = {
  nome: string;
  tipo: "Normal" | "IA";
  ia_id: string;
  saudacao_ia: string;
  audio: string;
  max_digits: number;
  tentativas: number;
  timeout: string;
  ativo: boolean;
};

function UraFormDialog({
  tenantId,
  disabled,
  ura,
  open: controlledOpen,
  onOpenChange,
}: {
  tenantId: number;
  disabled: boolean;
  ura?: Ura;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] =
    useState(false);

  const open =
    controlledOpen ?? internalOpen;

  const setOpen = (v: boolean) => {
    if (onOpenChange) {
      onOpenChange(v);
    } else {
      setInternalOpen(v);
    }
  };

  const editing = !!ura;

  const audiosFn =
    useServerFn(listAudios);

  const { data: audiosData } =
    useQuery({
      queryKey: [
        "ura-audios",
        tenantId,
      ],
      queryFn: () =>
        audiosFn({
          data: {
            tenant_id: tenantId,
            tipo: "normal",
          },
        }),
      enabled:
        open &&
        (!ura ||
          ura.tipo === "Normal"),
    });

  const destinosFn =
    useServerFn(listUraDestinos);

  const { data: destinosData } =
    useQuery({
      queryKey: [
        "ura-destinos",
        tenantId,
      ],
      queryFn: () =>
        destinosFn({
          data: {
            tenant_id: tenantId,
          },
        }),
      enabled: open,
    });

  const [form, setForm] =
    useState<UraFormState>({
      nome: ura?.nome ?? "",
      tipo: ura?.tipo ?? "Normal",
      ia_id: ura?.ia_id ?? "",
      saudacao_ia:
        ura?.saudacao_ia ?? "",
      audio: ura?.audio ?? "",
      max_digits:
        ura?.max_digits ?? 1,
      tentativas:
        ura?.tentativas ?? 3,
      timeout: String(
        ura?.timeout ?? 10,
      ),
      ativo:
        ura?.ativo ?? true,
    });

const listIaFn =
  useServerFn(listIa);

const { data: iaData } =
  useQuery({
    queryKey: [
      "ura-ias",
      tenantId,
    ],
    queryFn: () =>
      listIaFn({
        data: {
          tenant_id: tenantId,
        },
      }),
    enabled:
      open &&
      form.tipo === "IA",
  });

  const handleOpen = (v: boolean) => {
    setOpen(v);

    if (v) {
      setForm({
        nome: ura?.nome ?? "",
        tipo: ura?.tipo ?? "Normal",
        ia_id: ura?.ia_id ?? "",
        saudacao_ia:
          ura?.saudacao_ia ?? "",
        audio: ura?.audio ?? "",
        max_digits:
          ura?.max_digits ?? 1,
        tentativas:
          ura?.tentativas ?? 3,
        timeout: String(
          ura?.timeout ?? 10,
        ),
        ativo:
          ura?.ativo ?? true,
      });
    }
  };

  const qc = useQueryClient();

  const createFn =
    useServerFn(createUra);

  const updateFn =
    useServerFn(updateUra);

  const mut = useMutation({
    mutationFn: () => {
      const body = {
        tenant_id: tenantId,
        nome: form.nome,
        tipo: form.tipo,
        ia_id:
          form.tipo === "IA"
            ? form.ia_id
            : null,
        saudacao_ia:
          form.tipo === "IA"
            ? form.saudacao_ia
            : null,
        audio:
          form.tipo === "Normal"
            ? form.audio
            : null,
        max_digits:
          form.tipo === "Normal"
            ? form.max_digits
            : null,
        tentativas:
          form.tipo === "Normal"
            ? form.tentativas
            : null,
        timeout:
          form.tipo === "Normal"
            ? Number(form.timeout)
            : null,
        ativo: form.ativo,
      };

      return editing
        ? updateFn({
            data: {
              ura_identifier:
                ura!.ura_identifier,
              ...body,
            },
          })
        : createFn({
            data: body,
          });
    },

    onSuccess: () => {
      toast.success(
        editing
          ? "URA atualizada"
          : "URA criada",
      );

      qc.invalidateQueries({
        queryKey: [
          "uras",
          tenantId,
        ],
      });

      setOpen(false);
    },

    onError: (e: Error) =>
      toast.error(e.message),
  });

  const audios =
    audiosData?.audios ?? [];

const ias =
  iaData?.ia ?? [];

const iasAtivas =
  ias.filter((ia) => ia.ativa);

  const formValido =
    !!form.nome.trim() &&
    (form.tipo === "IA"
      ? !!form.ia_id &&
        !!form.saudacao_ia.trim()
      : !!form.audio &&
        form.max_digits >= 1 &&
        form.tentativas >= 1 &&
        Number(form.timeout) >= 1);

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpen}
    >
      {!editing && (
        <DialogTrigger asChild>
          <Button disabled={disabled}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar URA
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Editar URA ${ura!.nome}`
              : "Nova URA"}
          </DialogTitle>

          <DialogDescription>
            Configure o comportamento da
            URA.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();

            if (!formValido) {
              toast.error(
                "Preencha os campos obrigatórios",
              );
              return;
            }

            mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1">
            <Label>Nome *</Label>

            <Input
              value={form.nome}
              onChange={(e) =>
                setForm({
                  ...form,
                  nome: e.target.value,
                })
              }
              required
              maxLength={100}
            />
          </div>

          <div className="space-y-1">
            <Label>Tipo de URA *</Label>

            <Select
              value={form.tipo}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  tipo: v as
                    | "Normal"
                    | "IA",
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="Normal">
                  Normal
                </SelectItem>

                <SelectItem value="IA">
                  IA
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.tipo === "Normal" && (
            <>
              <div className="space-y-1">
                <Label>Áudio *</Label>

                <Select
                  value={form.audio}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      audio: v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o áudio" />
                  </SelectTrigger>

                  <SelectContent>
                    {audios.map(
                      (a) => (
                        <SelectItem
                          key={
                            a.audio_identifier
                          }
                          value={
                            a.audio_identifier
                          }
                        >
                          {a.display_name}
                        </SelectItem>
                      ),
                    )}

                    {audios.length ===
                      0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum .wav encontrado
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label>
                    Máx. dígitos
                  </Label>

                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={
                      form.max_digits
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        max_digits:
                          Number(
                            e.target
                              .value,
                          ),
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>
                    Tentativas
                  </Label>

                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={
                      form.tentativas
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tentativas:
                          Number(
                            e.target
                              .value,
                          ),
                      })
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>
                    Timeout (s)
                  </Label>

                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={
                      form.timeout
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        timeout:
                          e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}

          {form.tipo === "IA" && (
            <>
              <div className="space-y-1">
                <Label>
                  IA *
                </Label>

<Select
  value={form.ia_id}
  onValueChange={(value) =>
    setForm((prev) => ({
      ...prev,
      ia_id: value,
    }))
  }
>
  <SelectTrigger>
    <SelectValue placeholder="Selecione a IA" />
  </SelectTrigger>

  <SelectContent>
    {ias.filter((ia) => ia.ativa).length === 0 ? (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        Nenhuma IA cadastrada
      </div>
    ) : (
      ias
        .filter((ia) => ia.ativa)
        .map((ia) => (
          <SelectItem
            key={ia.id}
            value={String(ia.id)}
          >
            {ia.nome}
          </SelectItem>
        ))
    )}
  </SelectContent>
</Select>
</div>
              <div className="space-y-1">
                <Label>
                  Saudação da IA *
                </Label>

                <Input
                  value={
                    form.saudacao_ia
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      saudacao_ia:
                        e.target.value,
                    })
                  }
                  maxLength={255}
                  placeholder="Ex.: Olá! Sou a assistente virtual da empresa. Como posso ajudar?"
                />

                <p className="text-xs text-muted-foreground">
                  Esse texto será utilizado
                  pela IA/TTS como saudação.
                </p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setOpen(false)
              }
            >
              Cancelar
            </Button>

            <Button
              type="submit"
              disabled={
                mut.isPending ||
                !formValido
              }
            >
              {mut.isPending
                ? "Salvando…"
                : editing
                  ? "Salvar"
                  : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Opções ----------

type OpcaoForm = {
  chave: string;
  descricao: string;
  destinoState: DestinoState;
};

const emptyOpcao: OpcaoForm = {
  chave: "",
  descricao: "",
  destinoState: {
    tipo: "",
    destino: "",
    externoNumero: "",
    externoTronco: "",
  },
};

function opcaoToForm(o: {
  id: number;
  ura_identifier: string;
  chave: string;
  descricao: string | null;
  tipo_destino: string;
  destino: string;
}): OpcaoForm {
  const t = String(
    o?.tipo_destino || "",
  ).toUpperCase();

  const dest = String(
    o?.destino || "",
  );

  if (
    t === "EXTERNO" &&
    dest.includes("/")
  ) {
    const [
      numero,
      tronco,
    ] = dest.split("/");

    return {
      chave: o?.chave || "",
      descricao:
        o?.descricao || "",

      destinoState: {
        tipo: "EXTERNO",
        destino: "",
        externoNumero:
          numero || "",
        externoTronco:
          tronco || "",
      },
    };
  }

  return {
    chave: o?.chave || "",
    descricao:
      o?.descricao || "",

    destinoState: {
      tipo:
        t as DestinoValue["tipo"],
      destino: dest,
      externoNumero: "",
      externoTronco: "",
    },
  };
}

function UraOpcoesDialog({
  tenantId,
  ura,
  onClose,
}: {
  tenantId: number;
  ura: Ura;
  onClose: () => void;
}) {
  const destinosFn =
    useServerFn(listUraDestinos);

  const { data: destinos } =
    useQuery({
      queryKey: [
        "ura-destinos",
        tenantId,
      ],
      queryFn: () =>
        destinosFn({
          data: {
            tenant_id: tenantId,
          },
        }),
    });

  const qc = useQueryClient();

  const addFn =
    useServerFn(addUraOpcao);

  const updateFn =
    useServerFn(updateUraOpcao);

  const delFn =
    useServerFn(deleteUraOpcao);

  const [
    editingOpcao,
    setEditingOpcao,
  ] = useState<{
    id: number;
    ura_identifier: string;
  } | null>(null);

  const [form, setForm] =
    useState<OpcaoForm>(
      emptyOpcao,
    );

  function reset() {
    setForm({
      ...emptyOpcao,
      destinoState: {
        ...emptyOpcao.destinoState,
      },
    });

    setEditingOpcao(null);
  }

  const saveMut =
    useMutation({
      mutationFn: () => {
        const { tipo } =
          form.destinoState;

        const destinoFinal =
          buildDestinoForBackend(
            form.destinoState,
          );

        const body = {
          tenant_id: tenantId,

          chave: form.chave,

          descricao:
            form.descricao.trim() ||
            null,

          tipo_destino:
            tipo as any,

          destino: destinoFinal,
        };

        return editingOpcao
          ? updateFn({
              data: {
                ura_identifier:
                  editingOpcao.ura_identifier,
                id: editingOpcao.id,
                ...body,
              },
            })
          : addFn({
              data: {
                ura_identifier:
                  ura.ura_identifier,
                ...body,
              },
            });
      },

      onSuccess: () => {
        toast.success(
          editingOpcao
            ? "Opção atualizada"
            : "Opção adicionada",
        );

        qc.invalidateQueries({
          queryKey: [
            "uras",
            tenantId,
          ],
        });

        reset();
      },

      onError: (e: Error) =>
        toast.error(e.message),
    });

  const delMut =
    useMutation({
      mutationFn: ({
        ura_identifier,
        id,
      }: {
        ura_identifier: string;
        id: number;
      }) =>
        delFn({
          data: {
            ura_identifier,
            id,
            tenant_id: tenantId,
          },
        }),

      onSuccess: () => {
        toast.success(
          "Opção removida",
        );

        qc.invalidateQueries({
          queryKey: [
            "uras",
            tenantId,
          ],
        });
      },

      onError: (e: Error) =>
        toast.error(e.message),
    });

  function renderDestino(o: {
    tipo_destino: string;
    destino: string;
  }) {
    const t = String(
      o?.tipo_destino || "",
    ).toUpperCase();

    const dest = String(
      o?.destino || "",
    );

    const filas =
      Array.isArray(
        destinos?.filas,
      )
        ? destinos.filas
        : [];

    const uras =
      Array.isArray(
        destinos?.uras,
      )
        ? destinos.uras
        : [];

    const ramais =
      Array.isArray(
        destinos?.ramais,
      )
        ? destinos.ramais
        : [];

    if (t === "FILA") {
      return (
        filas.find(
          (x) =>
            String(x.value) ===
            dest,
        )?.label ?? dest
      );
    }

    if (t === "URA") {
      return (
        uras.find(
          (x) =>
            String(x.value) ===
            dest,
        )?.label ?? dest
      );
    }

    if (t === "RAMAL") {
      const r =
        ramais.find(
          (x) =>
            String(x.value) ===
            dest,
        );

      return r?.label
        ? displayFromBackend(
            r.label,
          )
        : dest;
    }

    if (t === "INTERNO") {
      return (
        TIPOS_INTERNOS.find(
          (x) =>
            x.value === dest,
        )?.label ?? dest
      );
    }

    return dest;
  }

  const isDestinoInvalid =
    isDestinoIncomplete(
      form.destinoState,
    );

  const opcoesList =
    Array.isArray(
      ura?.opcoes,
    )
      ? ura.opcoes
      : [];

  return (
    <Dialog
      open
      onOpenChange={(o) =>
        !o && onClose()
      }
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {displayFromBackend(
              ura.nome,
            )}{" "}
            — Opções
          </DialogTitle>

          <DialogDescription>
            Configure as chaves e os
            destinos da URA.
            {ura.tipo === "IA" &&
              " Na URA IA, a descrição ajuda o modelo a identificar a intenção."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  Chave
                </TableHead>

                <TableHead>
                  Descrição
                </TableHead>

                <TableHead>
                  Tipo
                </TableHead>

                <TableHead>
                  Destino
                </TableHead>

                <TableHead className="w-20 text-right">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {opcoesList.map(
                (o) => (
                  <TableRow
                    key={o.id}
                  >
                    <TableCell className="font-medium">
                      {o.chave ||
                        "-"}
                    </TableCell>

                    <TableCell className="max-w-xs">
                      <span className="text-sm text-muted-foreground">
                        {o.descricao ||
                          "—"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <Badge variant="outline">
                        {String(
                          o.tipo_destino,
                        ).toUpperCase()}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      {renderDestino(
                        o,
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingOpcao(
                              {
                                id: o.id,
                                ura_identifier:
                                  o.ura_identifier,
                              },
                            );

                            setForm(
                              opcaoToForm(
                                o,
                              ),
                            );
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            delMut.mutate(
                              {
                                ura_identifier:
                                  o.ura_identifier,
                                id: o.id,
                              },
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ),
              )}

              {opcoesList.length ===
                0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-4"
                  >
                    Sem opções.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="text-sm font-medium">
            {editingOpcao
              ? "Editar opção"
              : "Nova opção"}
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                Chave *
              </Label>

              <Input
                value={form.chave}
                maxLength={100}
                onChange={(e) =>
                  setForm({
                    ...form,
                    chave:
                      e.target.value,
                  })
                }
                placeholder={
                  ura.tipo === "IA"
                    ? "Ex.: Vendas, Financeiro, Suporte"
                    : "Ex.: 1, 2, 3, *"
                }
              />

              <p className="text-xs text-muted-foreground">
                {ura.tipo ===
                "IA"
                  ? 'Use o nome da intenção, por exemplo "Vendas" ou "Financeiro".'
                  : "Use o dígito ou tecla que o cliente deverá pressionar."}
              </p>
            </div>

            <div className="space-y-1">
              <Label>
                Descrição
              </Label>

              <Input
                value={
                  form.descricao
                }
                maxLength={255}
                onChange={(e) =>
                  setForm({
                    ...form,
                    descricao:
                      e.target.value,
                  })
                }
                placeholder={
                  ura.tipo ===
                  "IA"
                    ? "Ex.: Clientes interessados em comprar ou contratar serviços"
                    : "Ex.: Falar com o setor de vendas"
                }
              />

              {ura.tipo ===
                "IA" && (
                <p className="text-xs text-muted-foreground">
                  Explique o significado da
                  intenção para ajudar a IA a
                  classificá-la corretamente.
                </p>
              )}
            </div>

            <DestinoPicker
              tenantId={tenantId}
              value={
                form.destinoState
              }
              onChange={(
                destinoState,
              ) =>
                setForm({
                  ...form,
                  destinoState,
                })
              }
              allow={
                ALLOWED_DESTINOS_URA
              }
              excludeUraId={
                ura.ura_identifier
              }
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {editingOpcao && (
              <Button
                type="button"
                variant="outline"
                onClick={reset}
              >
                Cancelar edição
              </Button>
            )}

            <Button
              disabled={
                !form.chave.trim() ||
                isDestinoInvalid ||
                saveMut.isPending
              }
              onClick={() =>
                saveMut.mutate()
              }
            >
              {editingOpcao ? (
                <>
                  <Pencil className="mr-1 h-4 w-4" />
                  Salvar
                </>
              ) : (
                <>
                  <Plus className="mr-1 h-4 w-4" />
                  Adicionar opção
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
