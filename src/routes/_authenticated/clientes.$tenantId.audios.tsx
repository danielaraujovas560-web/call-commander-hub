import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileAudio, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteUraAudio,
  listUraAudios,
  renameUraAudio,
  uploadUraAudio,
} from "@/lib/ramais.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/clientes/$tenantId/audios")({
  head: () => ({ meta: [{ title: "Áudios — Cliente — Painel PABX" }] }),
  component: AudiosPage,
});

const AUDIO_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,119}$/;

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.readAsDataURL(file);
  });
}

function AudiosPage() {
  const tenantId = Number(Route.useParams().tenantId);
  const qc = useQueryClient();
  const listFn = useServerFn(listUraAudios);
  const uploadFn = useServerFn(uploadUraAudio);
  const renameFn = useServerFn(renameUraAudio);
  const deleteFn = useServerFn(deleteUraAudio);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const query = useQuery({
    queryKey: ["ura-audios", tenantId],
    queryFn: () => listFn({ data: { tenant_id: tenantId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["ura-audios", tenantId] });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !AUDIO_NAME.test(uploadName)) throw new Error("Selecione o arquivo e informe um nome válido");
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "wav" && extension !== "mp3") throw new Error("Envie um arquivo WAV ou MP3");
      return uploadFn({
        data: {
          tenant_id: tenantId,
          nome: uploadName,
          extensao: extension,
          conteudo_base64: await fileToBase64(file),
        },
      });
    },
    onSuccess: () => {
      toast.success("Áudio enviado e convertido com sucesso");
      setUploadOpen(false);
      setFile(null);
      setUploadName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: () => renameFn({ data: { tenant_id: tenantId, nome: renaming!, novo_nome: newName } }),
    onSuccess: () => {
      toast.success("Áudio renomeado e URAs atualizadas");
      setRenaming(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["uras", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (name: string) => deleteFn({ data: { tenant_id: tenantId, nome: name } }),
    onSuccess: () => {
      toast.success("Áudio excluído");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const audios = query.data?.audios ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Áudios</h1>
          <p className="text-sm text-muted-foreground">Prompts, saudações e mensagens deste cliente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setUploadOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar áudio</Button>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Formato</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {query.isLoading && <TableRow><TableCell colSpan={3} className="py-10 text-center">Carregando…</TableCell></TableRow>}
            {!query.isLoading && audios.length === 0 && <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">Nenhum áudio encontrado.</TableCell></TableRow>}
            {audios.map((name) => (
              <TableRow key={name}>
                <TableCell><div className="flex items-center gap-2"><FileAudio className="h-4 w-4" /><span className="font-mono">{name}</span></div></TableCell>
                <TableCell>WAV · mono · 8 kHz · PCM16</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => { setRenaming(name); setNewName(name); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={remove.isPending} onClick={() => { if (window.confirm(`Excluir o áudio “${name}”?`)) remove.mutate(name); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar áudio</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1"><Label>Arquivo WAV ou MP3</Label><Input type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={(e) => { const selected = e.target.files?.[0] ?? null; setFile(selected); if (selected) setUploadName(selected.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")); }} /></div>
            <div className="space-y-1"><Label>Nome no Asterisk</Label><Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} maxLength={120} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*" placeholder="saudacao_inicial" /><p className="text-xs text-muted-foreground">Sem extensão; use letras, números, hífen ou sublinhado.</p></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button><Button onClick={() => upload.mutate()} disabled={upload.isPending || !file || !AUDIO_NAME.test(uploadName)}>{upload.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear áudio</DialogTitle></DialogHeader>
          <div className="space-y-1"><Label>Novo nome</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRenaming(null)}>Cancelar</Button><Button onClick={() => rename.mutate()} disabled={rename.isPending || !AUDIO_NAME.test(newName) || newName === renaming}>{rename.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Renomear</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
