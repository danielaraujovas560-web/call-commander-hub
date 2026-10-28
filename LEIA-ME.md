# Layout compacto — Call Commander Hub

O script reduz a sensação de zoom do pacote visual anterior mantendo cards, tabelas, badges e botões.

Na raiz do projeto (`~/call-commander-hub-dev`):

```bash
python3 /caminho/visual_compacto/compactar_layout.py --project .
python3 /caminho/visual_compacto/compactar_layout.py --project . --apply
```

Para incluir também as três páginas editadas anteriormente (Integrações, Regras e Roteamento), acrescente `--include-modified` ao segundo comando.

O script cria backups em `.backup-layout-compacto/`, não altera lógica de servidor, dados ou eventos. Revise com `git diff` e teste com o comando de build habitual do projeto antes de publicar.
