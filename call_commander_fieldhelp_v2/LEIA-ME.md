# Call Commander Hub — IA compacta + FieldHelp compartilhado

Este pacote faz duas coisas no **código local atual** do projeto:

1. **`cliente.ia.tsx`**: aplica o visual híbrido **compacto** com três indicadores, busca para IAs/vozes, tabela mais limpa, badges de status e formulários compactos. Mantém as chamadas do backend e os fluxos de cadastro/edição/exclusão.
2. **Outras rotas em `src/routes/_authenticated`**: centraliza a ajuda em `src/components/field-help.tsx`; substitui funções `FieldHelp` locais e tooltips antigos com `HelpCircle` quando o texto pode ser migrado com segurança; acrescenta tooltips a Labels de Inputs/Selects ainda sem ajuda. Migra dicas estáticas simples localizadas logo abaixo de campos, sem remover mensagens dinâmicas ou avisos.

**Exceções:** não edita `cliente.relatorios.*`, `route.tsx` ou `cliente.tsx`. As três rotas modificadas anteriormente (Integrações, Regras e Roteamento) **são processadas a partir da sua versão local atual**; não são substituídas por código antigo.

## Instalação no Linux

Na raiz do seu projeto (`~/call-commander-hub-dev`), coloque o ZIP e execute:

```bash
cd ~/call-commander-hub-dev
unzip call_commander_fieldhelp_v2.zip

# Primeiro, veja quais arquivos serão editados (sem gravar):
python3 call_commander_fieldhelp_v2/aplicar_fieldhelp_e_ia.py --project .

# Aplicar com backup automático:
python3 call_commander_fieldhelp_v2/aplicar_fieldhelp_e_ia.py --project . --apply

# Inspecionar modificações e testar:
git diff --stat
git diff --check
npm run build
```

O script faz backup dos originais em `.backup-fieldhelp-ia/AAAAMMDD-.../`.

Se o arquivo `src/components/field-help.tsx` já existir, o backup da versão anterior também é criado.

## Opções

```bash
# Aplicar somente na rota de IA (inclui seu novo FieldHelp)
python3 call_commander_fieldhelp_v2/aplicar_fieldhelp_e_ia.py --project . --ia-only --apply

# Só tooltips, sem alteração de layout da IA
python3 call_commander_fieldhelp_v2/aplicar_fieldhelp_e_ia.py --project . --tooltips-only --apply

# Mostrar diferenças antes de aplicar
python3 call_commander_fieldhelp_v2/aplicar_fieldhelp_e_ia.py --project . --diff
```

## Por que o import é `@/components/field-help`?

O `tsconfig.json` do repositório configura `@/*` para `./src/*`, logo usar `@/src/components` apontaria para `src/src/components` e quebraria a resolução do módulo. O script usa:

```tsx
import { FieldHelp } from "@/components/field-help";
```

O componente também suporta o padrão anterior `<FieldHelp>texto</FieldHelp>` utilizado em arquivos híbridos mais antigos.

## Observações

- O script foi testado em cópias das versões híbridas de Integrações, Regras e Roteamento fornecidas nesta conversa, e em um arquivo de teste representativo de IA. A análise sintática de TSX passou nesses testes.
- **Não foi possível executar o build com as dependências e todos os arquivos reais do seu servidor**. Sempre revise as dicas geradas e o resultado visual antes de fazer commit/publicar.
- O texto explicativo sob campos só é removido quando o padrão é claramente texto auxiliar estático. Textos de erro, avisos, estados vazios e conteúdo dinâmico são preservados.
- O script é idempotente: executá-lo novamente sem novas alterações não deve duplicar dicas nem cards de resumo.
- Não altera o repositório remoto nem faz `git commit`.
