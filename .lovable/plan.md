
# Painel PABX — Fase 1 + 2 (Login + Ramais)

Confirmado: mini-agente HTTP no seu servidor, começamos por **login + ramais**, e relatório de DDD-saída usa `cdr_cidades_saida`.

## Arquitetura
```
Browser ──HTTPS──> Lovable (TanStack Start, Cloudflare Worker)
                       │
                       │  fetch + HMAC-SHA256 (X-Signature, X-Timestamp, X-Tenant-Id)
                       ▼
              https://agente.seuservidor (Node.js)
                       │
                       ▼
              MariaDB local (asterisk)
```

## Mini-agente (eu te entrego pronto ao final desta fase)
- Stack: Node.js 20 + Express + mysql2 (~200 linhas).
- Autenticação: HMAC-SHA256 sobre `timestamp + method + path + sha256(body)`. Janela 5 min anti-replay. Segredo único compartilhado (`PABX_AGENT_SECRET`).
- Multi-tenant: todo request traz `X-Tenant-Id`; o agente injeta `WHERE tenant_id = ?` em **toda** query. Sem header → 400.
- Endpoints desta fase:
  - `GET  /health`
  - `GET  /ramais?tenant=…`
  - `POST /ramais`        body: `{nome, ramal, senha, tronco, ddd, callerid, fixo, movel, ddi, especial, cng}`
  - `DELETE /ramais/:id`
  - `GET  /troncos?tenant=…`  (para popular dropdown no formulário de ramal)
- Cada `POST /ramais` faz, em transação:
  1. `INSERT INTO ramais (...)` — gera `endpoint_id` no padrão `<tenant_id><ramal>` (ex: `19999`).
  2. `INSERT INTO ps_aors (id, max_contacts, ...)` 
  3. `INSERT INTO ps_auths (id, auth_type='userpass', username, password, ...)`
  4. `INSERT INTO ps_endpoints (id, transport, aors, auth, context='from-internal', disallow='all', allow='alaw,ulaw,g729', tenant=...)` — segue o padrão dos seus registros atuais.
- `DELETE /ramais/:id`: remove de `ramais` + `ps_aors` + `ps_auths` + `ps_endpoints` em transação.
- Entregaremos com `systemd` unit, `.env.example`, `README` de deploy e snippet de nginx (HTTPS reverso).

## Lovable Cloud (auth + multi-tenant)
- **Auth**: email/senha (sem Google por ora — me diga se quiser).
- Tabelas novas:
  - `profiles` (id → auth.users, nome, criado_em) — RLS: dono só vê o próprio.
  - `app_role` enum: `admin | cliente`.
  - `user_roles` (user_id, role) — tabela separada + função `has_role(_uid, _role)` SECURITY DEFINER.
  - `tenants_link` (user_id, tenant_id int, label) — vincula usuário Lovable ↔ tenant do PABX. Admin pode ter vários.
  - `audit_log` (user_id, action, payload jsonb, ts).
- Trigger `on_auth_user_created` cria `profiles` automaticamente.
- Primeiro usuário cadastrado vira `admin` (trigger ou seed manual).
- RLS em todas. GRANTs explícitos (`authenticated`, `service_role`).

## Server functions (TanStack Start)
Em `src/lib/ramais.functions.ts` e `src/lib/agent.server.ts`:
- `agentFetch(path, method, body, tenantId)` — helper server-only que assina HMAC e chama o agente. Lê `PABX_AGENT_URL` e `PABX_AGENT_SECRET` de `process.env` dentro do handler.
- `listRamais()`  → `requireSupabaseAuth` → resolve tenant do usuário → `GET /ramais`.
- `createRamal(input)` → Zod valida (ramal `^\d{3,6}$`, senha min 6, ddd `^\d{2}$`, callerid opcional `^\d{10,13}$`, flags booleanas) → checa tenant → `POST /ramais` → grava em `audit_log`.
- `deleteRamal({id})` → idem → `DELETE /ramais/:id`.
- `listTroncos()` (para dropdown) → `GET /troncos`.
- Bearer Supabase já é anexado automaticamente pelo `attachSupabaseAuth` em `src/start.ts` (manter como está).

## Rotas (UI)
```
/auth                                  login/cadastro (shadcn forms, validação Zod)
/_authenticated/
  /                                    dashboard placeholder ("bem-vindo, próximas fases…")
  /ramais                              lista + add + deletar
  /servidor                            mostra IP do servidor (vem de env público) e status do agente (ping /health)
```
- Layout autenticado: sidebar com Ramais / Servidor (Relatórios/Troncos/Áudios aparecem desabilitados com tooltip "Em breve").
- `_authenticated/route.tsx`: usar o layout gerenciado pela integração Supabase (`ssr: false` + redirect `/auth`).

## Tela /ramais
- Tabela: **Ramal · Nome · Tronco · DDD · CallerID · Flags · Senha (oculta + 👁) · Ações (deletar)**.
- Botão "Adicionar ramal" → Dialog com formulário:
  - Nome, Número do ramal, Senha (gerador opcional), Tronco (select dos troncos do tenant), DDD, CallerID, switches Fixo/Móvel/DDI/Especial/CNG.
- Confirmação antes de deletar (AlertDialog).
- Toasts (sonner) de sucesso/erro.
- React Query com `ensureQueryData` + `useSuspenseQuery`, invalidando após mutation.
- Skeleton durante loading.

## Segurança
- Senha do ramal **nunca** logada nem retornada em listas (só sob clique "mostrar"). Backend retorna `senha` apenas no endpoint individual; vamos por hora retornar na lista, mascarando no front, e marcar como melhoria a separação em endpoint próprio se você preferir mais restrito.
- HMAC + replay-window no agente.
- Rate limit no agente (60 req/min/IP via `express-rate-limit`).
- Validação Zod em todo input.
- Auditoria de toda mutation.

## Secrets necessários (vou pedir via tool após você aprovar)
- `PABX_AGENT_URL` — ex: `https://agente.seudominio.com.br`
- `PABX_AGENT_SECRET` — chave HMAC compartilhada (eu gero uma sugestão)

## Entregáveis desta fase
1. Lovable Cloud habilitado + migrações (`profiles`, `user_roles`, `tenants_link`, `audit_log`, trigger).
2. Telas `/auth`, `/ramais`, `/servidor` + layout autenticado + sidebar.
3. Server functions `listRamais`, `createRamal`, `deleteRamal`, `listTroncos` + helper HMAC.
4. **Pasta `pabx-agent/` no repo** (não vai pro Worker — é só pra você baixar e rodar no seu servidor): `server.js`, `package.json`, `.env.example`, `systemd/pabx-agent.service`, `README.md` com passo-a-passo.
5. Tela `/servidor` mostrando ping do agente (✅ online / ❌ offline + último erro).

## Próximas fases (depois da sua aprovação desta)
- **Fase 3**: Relatórios (DDD via `cdr_cidades_saida` + `cdr_ramal`, filas, URA, pesquisa, ramais) com filtros, paginação, CSV e gráficos.
- **Fase 4**: Troncos (CRUD) + Áudios (upload multipart + `musiconhold`).
- **Fase 5**: Dashboard real + polimento.

Aprovando este plano, eu já começo pela infraestrutura (Cloud + migrações + auth) e sigo até a tela de ramais funcionando ponta-a-ponta com o agente.
