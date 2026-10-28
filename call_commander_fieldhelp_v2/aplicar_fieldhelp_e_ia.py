#!/usr/bin/env python3
"""Padroniza IA e extrai dicas de campos para FieldHelp reutilizável.

- Lê SEMPRE os arquivos locais do projeto, nunca substitui por versões antigas do GitHub.
- Não toca em cliente.relatorios.* nem em arquivos de infraestrutura/layout.
- Usa apenas biblioteca padrão do Python; saída determinística e idempotente.
- Cria cópias de segurança antes de qualquer escrita.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import difflib
from pathlib import Path
import re
import shutil
import sys
import unicodedata

FILE_IMPORT = 'import { FieldHelp } from "@/components/field-help";'
SKIP = {"route.tsx", "cliente.tsx", "_cliente-context.ts"}


def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def guess_help(label: str, file_name: str) -> str:
    """Dicas funcionais, sem repetir simplesmente o nome do campo."""
    v = normalize(label).replace("*", "").strip()
    scope = file_name.replace(".tsx", "").replace("cliente.", "").replace("admin.", "").replace(".", " ")
    rules = [
        (r"confian", "Valor mínimo de confiança para aceitar a resposta. Ex.: 0,75 corresponde a 75%."),
        (r"silencio apos|silencio final", "Tempo de silêncio, em segundos, necessário para encerrar a captura de fala."),
        (r"tempo maximo|timeout", "Tempo limite em segundos antes de interromper a operação ou avançar para a próxima etapa."),
        (r"intervalo", "Intervalo, em segundos, entre uma tentativa e outra."),
        (r"prioridade|penalidade", "Define a ordem de avaliação. Consulte a regra de prioridade aplicável a este recurso."),
        (r"voice id", "Identificador exato da voz no provedor de síntese de fala (TTS), como sarah."),
        (r"modelo de voz", "Selecione um modelo de voz disponível e ativo no provedor de TTS."),
        (r"modelo logico|modelo de ia|modelo ia", "Modelo de IA responsável pelo processamento e pela tomada de decisão."),
        (r"voz$", "Escolha uma voz cadastrada para as respostas de áudio."),
        (r"numero|telefone|did", "Número utilizado nesta configuração. Confira o formato antes de salvar."),
        (r"ddd", "Código de área (DDD) utilizado nas chamadas deste registro."),
        (r"caller.?id", "Identificação de chamada que será apresentada quando esse recurso originar ligações."),
        (r"ramal", "Selecione ou informe o número do ramal interno do PABX."),
        (r"tronco", "Tronco SIP/PJSIP responsável pelo encaminhamento das chamadas."),
        (r"destino", "Selecione para onde as chamadas serão encaminhadas quando esta condição ocorrer."),
        (r"tipo de ligacao", "Classificação de chamadas usada pelas regras de permissão e roteamento."),
        (r"tipo de destino", "Categoria do recurso que receberá a chamada, como ramal, fila, URA ou número externo."),
        (r"csp", "Código da prestadora de serviço (operadora), usado em regras de discagem."),
        (r"expressao transformada", "Resultado gerado quando a regra corresponde à expressão original. Grupos capturados podem ser reutilizados."),
        (r"expressao|regex", "Expressão usada para reconhecer números de discagem; revise os grupos e âncoras antes de salvar."),
        (r"senha|password", "Credencial de autenticação. Guarde em local seguro e evite reutilizá-la."),
        (r"token|chave.*api|api key", "Credencial de acesso à integração. Não compartilhe este valor em mensagens ou logs."),
        (r"waba", "ID da conta WhatsApp Business na Meta; é diferente do Phone Number ID."),
        (r"phone number id", "Identificador interno do número na Meta Cloud API; não é o telefone formatado."),
        (r"template", "Nome do modelo de mensagem previamente cadastrado e aprovado na plataforma."),
        (r"idioma", "Código de idioma esperado pelo provedor, por exemplo pt_BR."),
        (r"horario|hora", "Horário aplicado a esta regra. Confira os dias e o período de funcionamento."),
        (r"estrategia", "Define como as chamadas serão distribuídas entre os agentes da fila."),
        (r"webhook", "Selecione a integração responsável pelas notificações e eventos deste roteamento."),
        (r"modelo de numeracao", "Selecione STFC para regras de discagem nacionais ou E164 para números em formato internacional."),
        (r"musica.*espera|audio", "Áudio ou música reproduzido ao chamador durante esta etapa."),
        (r"gravacao|gravar", "Define a política de gravação das chamadas deste recurso."),
        (r"pesquisa", "Pesquisa de satisfação apresentada conforme as regras de atendimento configuradas."),
        (r"caminho|arquivo", "Informe ou selecione o arquivo utilizado por este recurso."),
        (r"descricao", "Texto opcional para facilitar a identificação deste registro no painel."),
        (r"nome.*empresa|razao social", "Nome de exibição da empresa nesta configuração."),
        (r"nome", f"Nome usado para identificar este registro na página de {scope}."),
        (r"status|ativo", "Habilita ou desabilita o recurso sem excluir sua configuração."),
    ]
    for pattern, message in rules:
        if re.search(pattern, v):
            return message
    return f"Defina o valor de {label.strip().rstrip('*').strip()} para este registro."


def make_prop(text: str) -> str:
    # String JSX, com aspas e barras de escape corretas.
    clean = re.sub(r"\s+", " ", text).strip()
    clean = clean.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{clean}"'


def remove_local_field_help(src: str) -> str:
    # Usa âncoras no nível raiz para não remover outras funções.
    pattern = r"(?ms)^function FieldHelp\([^\n]+\) \{.*?^\}\n\n?"
    src = re.sub(pattern, "", src)
    # Também atende às implementações compactas de uma única linha.
    single_line = r"(?m)^function FieldHelp\([^\n]*\) \{[^\n]*\}\n\n?"
    return re.sub(single_line, "", src)


def replace_legacy_help_icons(src: str) -> tuple[str, int]:
    """Converte TooltipProvider+HelpCircle com conteúdo textual estático para FieldHelp."""
    blocks = re.compile(r"<TooltipProvider\b[^>]*>[\s\S]*?</TooltipProvider>")
    done = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal done
        block = match.group(0)
        if "HelpCircle" not in block or "<TooltipContent" not in block:
            return block
        text_match = re.search(r"<p\b[^>]*>([\s\S]*?)</p>", block)
        if not text_match:
            return block
        raw = text_match.group(1)
        if "<" in raw or "{" in raw or "}" in raw:
            return block
        message = re.sub(r"\s+", " ", raw).strip()
        if not message:
            return block
        done += 1
        return f"<FieldHelp text={make_prop(message)} />"

    return blocks.sub(replace, src), done


LABEL_PATTERN = re.compile(r"<Label\b(?P<attrs>[^>]*?)>(?P<label>[^<>]*?)</Label>")


def add_help_to_field_labels(src: str, filename: str) -> tuple[str, int]:
    """Insere ícone apenas em Label de um campo Input/Select/Textarea, sem duplicar tooltip."""
    done = 0
    matches = list(LABEL_PATTERN.finditer(src))
    for m in reversed(matches):
        label_text = m.group("label").strip()
        if not label_text or "{" in label_text or "}" in label_text:
            continue
        # Verifica a região até o próximo Label para não atribuir ajuda ao campo errado.
        next_m = next((x for x in matches if x.start() > m.end()), None)
        tail_end = min(next_m.start() if next_m else len(src), m.end() + 2300)
        tail = src[m.end():tail_end]
        if not re.search(r"<(Input|Select\b|Textarea\b|Switch\b)", tail):
            continue
        if "<FieldHelp" in tail[:550]:
            continue
        # Evita texto descritivo no cabeçalho de tabelas e filtros sem campos.
        if "</DialogFooter>" in tail[:200]:
            continue
        attrs = m.group("attrs")
        title_m = re.search(r'\s+title="([^"\n]+)"', attrs)
        explanation = title_m.group(1) if title_m else guess_help(label_text, filename)
        if title_m:
            attrs = attrs[:title_m.start()] + attrs[title_m.end():]
        label = f"<Label{attrs}>{m.group('label')}</Label>"
        tooltip = f"<FieldHelp text={make_prop(explanation)} />"
        # Se já existir um wrapper flex exatamente antes do Label, só anexa o ícone.
        before = src[max(0, m.start() - 150):m.start()]
        wrapper = re.search(r'<div className="[^"]*\bflex\b[^"]*\bitems-center\b[^"]*">\s*$', before)
        if wrapper:
            replacement = label + "\n                " + tooltip
        else:
            replacement = '<div className="flex items-center gap-1.5">' + label + " " + tooltip + "</div>"
        src = src[:m.start()] + replacement + src[m.end():]
        done += 1
    return src, done


def move_nearby_static_hints(src: str) -> tuple[str, int]:
    """Migra apenas ajuda textual imediatamente abaixo de Input para Tooltip.

    Não apaga avisos dinâmicos, estados vazios, erros, listas de valores ou dicas de
    outras partes da página. Somente blocos estáticos com um ícone FieldHelp no
    cabeçalho do mesmo campo são candidatos.
    """
    ptn = re.compile(
        r'(?P<end>/>|</Select>|</Textarea>)(?P<white>\s*)'
        r'<p className="text-xs text-muted-foreground(?: [^"]*)?">'
        r'(?P<text>[^<{}]{12,240})</p>', re.S
    )
    changes = 0
    # Alterações aplicadas de trás para frente para manter offsets corretos.
    for m in reversed(list(ptn.finditer(src))):
        left = src[max(0, m.start()-1800):m.start()]
        label_pos = left.rfind("<Label")
        if label_pos < 0:
            continue
        relevant = left[label_pos:]
        help_match = re.search(r'<FieldHelp text="((?:\\.|[^"\\])*)"\s*/>', relevant)
        if not help_match or len(relevant) > 1100:
            continue
        # A descrição deve pertencer ao campo próximo, sem outro cabeçalho entre eles.
        if relevant.count("<Label") != 1 or re.search(r"<p\b", relevant):
            continue
        note = re.sub(r"\s+", " ", m.group("text")).strip()
        if not note or any(phrase in normalize(note) for phrase in ("erro", "nenhum resultado", "carregando", "clique para")):
            continue
        existing = help_match.group(1).replace('\\"', '"').replace('\\\\', '\\')
        # Prefere texto específico que já existia na interface em vez da dica genérica.
        b = max(0, m.start()-1800) + label_pos + help_match.start()
        e = max(0, m.start()-1800) + label_pos + help_match.end()
        updated = f'<FieldHelp text={make_prop(note)} />'
        # Só faz substituição se a dica antiga for do script (não sobrescreve
        # tooltip manual e específico já feito pelo desenvolvedor).
        if "Defina o valor" in existing or "Nome usado para identificar" in existing or "Texto opcional" in existing:
            src = src[:b] + updated + src[e:]
        # Remove o parágrafo de ajuda apenas; mantém `/>` e quebras anteriores.
        # Recalcula pelo conteúdo do snippet para suportar a troca de comprimento.
        candidate = m.group(0)
        p_start = candidate.find("<p ")
        p_text = candidate[p_start:]
        at = src.find(p_text, max(0, m.start()-100), m.start()+len(candidate)+len(updated)+120)
        if at >= 0:
            src = src[:at] + src[at+len(p_text):]
            changes += 1
    return src, changes


def add_import(src: str) -> str:
    if "<FieldHelp" not in src or FILE_IMPORT in src:
        return src
    # Já tem import por alias? Não adiciona duplicado.
    if re.search(r'import\s+\{\s*FieldHelp\s*\}\s+from\s+["\']@/components/field-help["\']', src):
        return src
    first = re.search(r'^import\b', src, re.M)
    return src[:first.start()] + FILE_IMPORT + "\n" + src[first.start():] if first else src


def style_ia(src: str) -> str:
    """Adapta a tela específica de IA ao layout híbrido compacto (sem alterar API)."""
    # Idempotência: marcação exclusiva fica apenas nas páginas transformadas.
    if "{/* fieldhelp:ia-compact-v2 */}" in src:
        return src
    if 'function IaPage()' not in src:
        print("[aviso] IA: componente IaPage não encontrado; visual não modificado.")
        return src

    # Busca, cards de estatísticas e estilos compactos.
    src = src.replace('  HelpCircle,\n', '  HelpCircle,\n  Search,\n', 1) if "  Search," not in src else src
    badge_import = 'import { Badge } from "@/components/ui/badge";'
    if badge_import not in src:
        src = src.replace('import { Button } from "@/components/ui/button";',
                          'import { Button } from "@/components/ui/button";\n' + badge_import, 1)

    state_anchor = '  const [activeTab, setActiveTab] = useState<"vozes" | "ias">("ias");'
    if state_anchor in src:
        src = src.replace(state_anchor, state_anchor + '\n  const [busca, setBusca] = useState("");', 1)

    data_anchor = '  const ias = iaQuery.data?.ia ?? [];'
    if data_anchor in src:
        src = src.replace(data_anchor, data_anchor + '''
  const termoBusca = busca.trim().toLocaleLowerCase("pt-BR");
  const iasVisiveis = ias.filter((item) =>
    !termoBusca ||
    [item.nome, item.modelo_logico?.nome, item.modelo_logico?.provider, item.voz?.nome]
      .some((valor) => String(valor ?? "").toLocaleLowerCase("pt-BR").includes(termoBusca)),
  );
  const vozesVisiveis = voices.filter((item) =>
    !termoBusca ||
    [item.nome, item.voice_id, item.modelo?.nome, item.modelo?.provider]
      .some((valor) => String(valor ?? "").toLocaleLowerCase("pt-BR").includes(termoBusca)),
  );''', 1)

    src = src.replace('    <div className="space-y-6">\n      <Tabs',
                      '    <div className="min-w-0 space-y-4">\n      <Tabs', 1)
    src = src.replace('className="w-full space-y-6"', 'className="w-full space-y-4"', 1)
    src = src.replace('<h1 className="text-2xl font-semibold">Inteligência Artificial</h1>',
                      '<h1 className="text-xl font-semibold tracking-tight">Inteligência Artificial</h1>', 1)
    src = src.replace('        <div className="flex flex-wrap items-center justify-between gap-3">',
                      '        <div className="flex flex-wrap items-center justify-between gap-3">', 1)

    old_actions = '          <div className="flex gap-2">\n            <Button variant="outline" size="icon" onClick={refresh}'
    new_actions = '''          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={activeTab === "ias" ? "Buscar IA ou modelo..." : "Buscar voz ou ID..."}
                aria-label="Buscar na lista"
                className="h-9 pl-9"
              />
            </div>
            <Button variant="outline" size="icon" aria-label="Atualizar lista" title="Atualizar" onClick={refresh}'''
    src = src.replace(old_actions, new_actions, 1)

    tab_anchor = '        <TabsList className="grid w-full max-w-md grid-cols-2">'
    if tab_anchor in src:
        summary = '''        {/* fieldhelp:ia-compact-v2 */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">IAs cadastradas</p>
              <Bot className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{ias.length}</p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">IAs ativas</p>
              <Settings2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {ias.filter((item) => item.ativa).length}
            </p>
          </div>
          <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Vozes cadastradas</p>
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{voices.length}</p>
          </div>
        </div>

'''
        src = src.replace(tab_anchor, summary + '        <TabsList className="grid h-9 w-full max-w-xs grid-cols-2 rounded-lg">', 1)

    src = src.replace('className="rounded-md border bg-card"',
                      'className="overflow-hidden rounded-xl border bg-card shadow-sm"')
    src = src.replace('<TableHeader>', '<TableHeader className="bg-muted/40">')
    src = src.replace('ias.map((ia) => (', 'iasVisiveis.map((ia) => (')
    src = src.replace('voices.map((voice) => (', 'vozesVisiveis.map((voice) => (', 1)
    src = src.replace('ias.length === 0 && (', 'iasVisiveis.length === 0 && (')
    src = src.replace('voices.length === 0 && (', 'vozesVisiveis.length === 0 && (')
    src = src.replace('Nenhuma IA cadastrada para este cliente.',
                      '{busca ? "Nenhuma IA corresponde à busca." : "Nenhuma IA cadastrada para este cliente."}')
    src = src.replace('Nenhuma voz cadastrada para este cliente.',
                      '{busca ? "Nenhuma voz corresponde à busca." : "Nenhuma voz cadastrada para este cliente."}')
    src = src.replace('<TableRow key={ia.id}>', '<TableRow key={ia.id} className="hover:bg-muted/30">')
    src = src.replace('<TableRow key={voice.id}>', '<TableRow key={voice.id} className="hover:bg-muted/30">')
    src = src.replace('''{ia.ativa ? (
                        <span className="text-sm text-green-600">Ativa</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Inativa</span>
                      )}''',
                      '<Badge variant={ia.ativa ? "default" : "secondary"}>{ia.ativa ? "Ativa" : "Inativa"}</Badge>')
    # Corrige alinhamento do estado vazio: tabela de IAs tem 6 colunas.
    src = src.replace('colSpan={7}', 'colSpan={6}')
    src = src.replace('<DialogContent>\n          <DialogHeader>',
                      '<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">\n          <DialogHeader>')
    src = src.replace('<div className="space-y-1">\n              <Label>',
                      '<div className="space-y-1.5">\n              <Label>')
    return src


def transform(src: str, filename: str, tooltip_only: bool) -> tuple[str, dict]:
    counters = {"migrados": 0, "novos": 0, "descricoes": 0, "ia_visual": False}
    old = src
    if filename == "cliente.ia.tsx" and not tooltip_only:
        src = style_ia(src)
        counters["ia_visual"] = old != src
    src = remove_local_field_help(src)
    src, counters["migrados"] = replace_legacy_help_icons(src)
    src, counters["novos"] = add_help_to_field_labels(src, filename)
    src, counters["descricoes"] = move_nearby_static_hints(src)
    src = add_import(src)
    return src, counters


def main() -> None:
    p = argparse.ArgumentParser(description="Padroniza IA e instala FieldHelp reutilizável nas rotas.")
    p.add_argument("--project", default=".", help="Pasta raiz que contém src, tsconfig.json e package.json")
    p.add_argument("--apply", action="store_true", help="Aplica as alterações; sem esta opção só mostra prévia")
    p.add_argument("--diff", action="store_true", help="Mostra diff de todas as alterações")
    p.add_argument("--ia-only", action="store_true", help="Processa apenas cliente.ia.tsx")
    p.add_argument("--tooltips-only", action="store_true", help="Não altera o visual da IA")
    args = p.parse_args()

    root = Path(args.project).expanduser().resolve()
    route_dir = root / "src/routes/_authenticated"
    dest = root / "src/components/field-help.tsx"
    template = Path(__file__).resolve().parent / "src/components/field-help.tsx"
    if not route_dir.is_dir():
        p.error("Pasta src/routes/_authenticated não encontrada em " + str(root))
    if not template.exists():
        p.error("Arquivo src/components/field-help.tsx não encontrado junto ao script")
    config = root / "tsconfig.json"
    if config.exists() and not re.search(r'"@/\*"\s*:\s*\[\s*"\./src/\*"', config.read_text(encoding="utf-8")):
        print("AVISO: confirme o alias @/ no tsconfig.json antes de executar o projeto.")
    if args.ia_only and args.tooltips_only:
        p.error("Escolha apenas um entre --ia-only e --tooltips-only")

    backup = root / ".backup-fieldhelp-ia" / datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    changes: list[tuple[Path, str, str, dict]] = []
    files = [route_dir / "cliente.ia.tsx"] if args.ia_only else sorted(route_dir.glob("*.tsx"))
    for path in files:
        if (path.name in SKIP or path.name.startswith("cliente.relatorios.")
                or not path.exists()):
            continue
        before = path.read_text(encoding="utf-8")
        after, stats = transform(before, path.name, args.tooltips_only)
        if before != after:
            changes.append((path, before, after, stats))

    component_before = dest.read_text(encoding="utf-8") if dest.exists() else None
    component_after = template.read_text(encoding="utf-8")
    component_changed = component_before != component_after
    verb = "Aplicando" if args.apply else "Prévia"
    print(f"{verb}: {len(changes)} rotas + componente FieldHelp ({'novo/atualizado' if component_changed else 'sem alterações'}).")
    for path, before, after, stats in changes:
        print(f"  {path.name}: {stats['migrados']} existentes migrados, {stats['novos']} novos, {stats['descricoes']} descrições convertidas" +
              (", IA visual padronizado" if stats["ia_visual"] else ""))
        if args.diff:
            print("".join(difflib.unified_diff(before.splitlines(True), after.splitlines(True),
                                               fromfile=path.name, tofile=path.name+" (novo)")))

    if args.apply:
        for path, before, after, stats in changes:
            rel = path.relative_to(root)
            target = backup / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
            path.write_text(after, encoding="utf-8")
        if component_changed:
            if component_before is not None:
                b = backup / dest.relative_to(root)
                b.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(dest, b)
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(component_after, encoding="utf-8")
        print("Backups:", backup if changes or (component_changed and component_before is not None) else "nenhum original sobrescrito")
        print("Concluído. Revise git diff e rode npm run build antes de publicar.")
    else:
        print("Nenhum arquivo foi gravado. Rode novamente com --apply para executar.")

if __name__ == "__main__":
    main()
