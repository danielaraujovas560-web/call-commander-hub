import { useState } from "react";
import { CheckCircle2, FlaskConical, XCircle, HelpCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type Modelo = "E164" | "STFC";

export type Regra = {
  id: number;
  tronco_identifier: string;
  tronco_nome?: string;
  regra_nome: string;
  tipo: Modelo;
  tipo_ligacao: string;
  codigo_csp: string | null;
  expressao: string;
  expressao_transformada: string;
  prioridade: number;
};

export type ResultadoSimulacao = {
  sucesso: boolean;
  numero_original: string;
  numero_transformado: string | null;
  tipo_ligacao: string | null;
  regra_nome: string | null;
  prioridade: number | null;
  codigo_csp: string | null;
  mensagem: string;
};

type SimuladorRegraProps = {
  troncoIdentifier: string;
  modelo: Modelo;
  regras: Regra[];
};

const listaDDDs = Array.from({ length: 89 }, (_, i) => String(i + 11));

function simularRegras(regras: Regra[], numero: string, dddAgente: string): ResultadoSimulacao {
  const numeroOriginal = numero.trim();

  if (!numeroOriginal) {
    return {
      sucesso: false,
      numero_original: numeroOriginal,
      numero_transformado: null,
      tipo_ligacao: null,
      regra_nome: null,
      prioridade: null,
      codigo_csp: null,
      mensagem: "Informe um número para testar.",
    };
  }

  for (const regra of regras) {
    let regex: RegExp;

    try {
      regex = new RegExp(regra.expressao);
    } catch {
      return {
        sucesso: false,
        numero_original: numeroOriginal,
        numero_transformado: null,
        tipo_ligacao: null,
        regra_nome: regra.regra_nome,
        prioridade: regra.prioridade,
        codigo_csp: regra.codigo_csp,
        mensagem: `A expressão da regra "${regra.regra_nome}" é inválida.`,
      };
    }

    if (!regex.test(numeroOriginal)) {
      continue;
    }

    try {
      const transformacao = regra.expressao_transformada
        .replace(/\$\{DDD_AGENTE\}/g, dddAgente)
        .replace(/\\(\d+)/g, (_, grupo: string) => `$${grupo}`);

      let numeroTransformado = numeroOriginal.replace(regex, transformacao);

      if (regra.codigo_csp) {
        numeroTransformado = `${regra.codigo_csp}${numeroTransformado}`;
      }

      return {
        sucesso: true,
        numero_original: numeroOriginal,
        numero_transformado: numeroTransformado,
        tipo_ligacao: regra.tipo_ligacao,
        regra_nome: regra.regra_nome,
        prioridade: regra.prioridade,
        codigo_csp: regra.codigo_csp,
        mensagem: "Regra correspondente encontrada.",
      };
    } catch {
      return {
        sucesso: false,
        numero_original: numeroOriginal,
        numero_transformado: null,
        tipo_ligacao: null,
        regra_nome: regra.regra_nome,
        prioridade: regra.prioridade,
        codigo_csp: regra.codigo_csp,
        mensagem: "Não foi possível aplicar a transformação.",
      };
    }
  }

  return {
    sucesso: false,
    numero_original: numeroOriginal,
    numero_transformado: null,
    tipo_ligacao: null,
    regra_nome: null,
    prioridade: null,
    codigo_csp: null,
    mensagem: "Nenhuma regra correspondeu ao número informado.",
  };
}

export function SimuladorRegra({ modelo, regras }: SimuladorRegraProps) {
  const [aberto, setAberto] = useState(false);
  const [numero, setNumero] = useState("");
  const [ddd, setDdd] = useState("27");
  const [resultado, setResultado] = useState<ResultadoSimulacao | null>(null);

  const usaDddAgente = regras.some((regra) =>
    regra.expressao_transformada.includes("${DDD_AGENTE}"),
  );

  function executarTeste() {
    setResultado(simularRegras(regras, numero, ddd));
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(open) => {
        setAberto(open);

        if (!open) {
          setResultado(null);
          setNumero("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FlaskConical className="mr-2 size-4" />
          Testar regra
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Simulador de roteamento</DialogTitle>
          <DialogDescription>
            Teste as regras cadastradas para este tronco. Nenhuma chamada será realizada e nenhuma
            configuração será alterada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Modelo</Label>
              <div className="rounded-md border bg-muted/30 p-2.5 text-sm font-medium">
                {modelo}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Regras disponíveis</Label>
              <div className="rounded-md border bg-muted/30 p-2.5 text-sm font-medium">
                {regras.length}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="simulador-numero">Número para testar</Label>

            <Input
              id="simulador-numero"
              value={numero}
              onChange={(event) => {
                setNumero(event.target.value);
                setResultado(null);
              }}
              placeholder={modelo === "E164" ? "Ex.: 5527992930238" : "Ex.: 27992930238"}
              autoComplete="off"
            />
          </div>

          {usaDddAgente && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="simulador-ddd">DDD do agente</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium text-xs mb-1">
                        {
                          "Esse cabeçalho só aparece quando usado '${DDD_AGENTE}' em uma expressão. Selecione o DDD para testar junto da regra."
                        }
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <Select
                value={ddd}
                onValueChange={(value) => {
                  setDdd(value);
                  setResultado(null);
                }}
              >
                <SelectTrigger id="simulador-ddd">
                  <SelectValue placeholder="Selecione o DDD" />
                </SelectTrigger>

                <SelectContent>
                  {listaDDDs.map((codigo) => (
                    <SelectItem key={codigo} value={codigo}>
                      {codigo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {resultado && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-2">
                {resultado.sucesso ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                )}

                <div className="min-w-0">
                  <p className="font-medium">{resultado.mensagem}</p>
                </div>
              </div>

              {resultado.sucesso && (
                <div className="space-y-3 border-t pt-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Tipo da ligação</span>

                    <Badge variant="outline">{resultado.tipo_ligacao}</Badge>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Regra aplicada</span>

                    <span className="text-right text-sm font-medium">{resultado.regra_nome}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">Prioridade</span>

                    <span className="text-sm font-medium">{resultado.prioridade}</span>
                  </div>

                  <div className="space-y-1 rounded-md bg-muted p-3">
                    <Label>Número original</Label>
                    <p className="break-all font-mono text-sm">{resultado.numero_original}</p>
                  </div>

                  <div className="space-y-1 rounded-md border p-3">
                    <Label>Número final</Label>
                    <p className="break-all font-mono text-lg font-semibold">
                      {resultado.numero_transformado}
                    </p>
                  </div>

                  {resultado.codigo_csp && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">CSP aplicado</span>

                      <Badge variant="secondary" className="font-mono">
                        {resultado.codigo_csp}
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={executarTeste}
            disabled={!numero.trim() || regras.length === 0}
          >
            <FlaskConical className="mr-2 size-4" />
            Simular roteamento
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
