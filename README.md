# Painel PABX

Painel web para gestão de PABX Asterisk (ramais, servidor, relatórios de CDR),
com autenticação multi-tenant via Supabase e um mini-agente HTTPS que roda
junto ao servidor Asterisk para expor o MariaDB de realtime de forma segura.

Stack:

- **Frontend / SSR:** React 19 + TanStack Start (Vite 7)
- **UI:** Tailwind v4 + shadcn/ui (Radix)
- **Estado de dados:** TanStack Query
- **Backend de aplicação:** Supabase (Postgres + Auth + RLS)
- **Backend do PABX:** `pabx-agent/` — Node 20, Express, HMAC, fala com MariaDB do Asterisk
- **Runtime de produção:** qualquer host Node 20+ ou edge compatível (o template foi pensado para Cloudflare Workers, mas roda como Node SSR sem alterações com `vite preview` atrás de um proxy reverso)

---

## 1. Pré-requisitos

- Git
- Node.js 20+ e npm 10+ (ou bun/pnpm — o lockfile do repo é `bun.lock`, mas
  todos os scripts funcionam com `npm install` / `npm run ...`)
- Um projeto Supabase próprio (self-hosted ou supabase.com)
- Asterisk com MariaDB/MySQL (realtime) para o agente

---

## 2. Rodar localmente

```bash
git clone <SEU_REPO_GIT>
cd <pasta-do-projeto>

# instalar dependências
npm install

# preparar variáveis de ambiente
cp .env.example .env
# edite .env com seus valores

# subir em modo dev (HMR)
npm run dev
# abre em http://localhost:8080
```

### Scripts disponíveis

| Script              | O que faz                                            |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Servidor de desenvolvimento Vite com HMR             |
| `npm run build`     | Build de produção (SSR)                              |
| `npm run build:dev` | Build em modo development (útil para debug)          |
| `npm run preview`   | Sobe o build de produção localmente                  |
| `npm run lint`      | ESLint                                               |
| `npm run format`    | Prettier                                             |

---

## 3. Variáveis de ambiente

Veja `.env.example` para a lista completa. Resumo:

**Frontend (bundladas — `VITE_*`):**

- `VITE_SUPABASE_URL` — URL do seu projeto Supabase
- `VITE_SUPABASE_PUBLISHABLE_KEY` — chave pública (anon)
- `VITE_SUPABASE_PROJECT_ID` — ref do projeto

**Servidor (runtime, NUNCA bundladas):**

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` — espelham as do frontend
- `SUPABASE_SERVICE_ROLE_KEY` — **secreto**, bypassa RLS, usado em server functions administrativas
- `PABX_AGENT_URL` — URL HTTPS pública do mini-agente
- `PABX_AGENT_SECRET` — segredo HMAC compartilhado com o agente

Regras importantes:

- Nunca prefixe a `service_role` com `VITE_` — ela vazaria para o navegador.
- Em produção, configure essas variáveis no painel do host (Vercel, Coolify, systemd, etc.), não comite `.env`.

---

## 4. Configurar o Supabase

O projeto não exige Supabase gerenciado pela Lovable. Você pode usar:

- supabase.com (plano free serve), ou
- Supabase self-hosted (Docker compose oficial).

### 4.1 Aplicar o schema

Os arquivos SQL estão em `supabase/migrations/` (ordenados por timestamp).
Aplique na ordem em um Postgres novo:

```bash
# via Supabase CLI (recomendado)
supabase link --project-ref SEU_REF
supabase db push

# ou direto via psql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260612193009_*.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260612193029_*.sql
```

O schema cria:

- `profiles` — dados básicos do usuário (1:1 com `auth.users`)
- `user_roles` (+ enum `app_role`) — papéis (`admin`, `cliente`)
- `tenants_link` — relação usuário ↔ tenant_id do PABX
- `audit_log` — auditoria de ações administrativas
- função `has_role(uuid, app_role)` — usada por todas as policies RLS
- função `handle_new_user()` + trigger em `auth.users` — cria profile no signup e promove o **primeiro usuário a admin**

### 4.2 Habilitar provedores de autenticação

No painel Supabase → Authentication → Providers, habilite **Email/Password**
(o app já usa só esse). Se quiser adicionar Google/Apple, configure o provider
no Supabase e use `supabase.auth.signInWithOAuth` (a app não usa o broker Lovable
fora do ambiente Lovable).

### 4.3 Criar o primeiro admin

A página `/auth` só tem login (signup foi removido). Para criar o primeiro
admin em uma instalação nova, use a Auth Admin API do Supabase ou o painel:

1. Painel Supabase → Authentication → Add user → preencha email/senha.
2. O trigger `handle_new_user` insere automaticamente um registro em `profiles`
   e marca como `admin` se for o primeiro usuário. Senão, ele entra como `cliente`
   e você precisa promovê-lo:

```sql
update public.user_roles
set role = 'admin'
where user_id = (select id from auth.users where email = 'voce@exemplo.com');
```

A partir daí, faça login no painel e gerencie os demais usuários em
**Administração → Usuários**.

---

## 5. Mini-agente PABX (`pabx-agent/`)

Servidor Node que roda no host do Asterisk. O painel **nunca** fala direto
com o MariaDB — todas as leituras passam pelo agente, autenticadas via HMAC.

Subir o agente:

```bash
cd pabx-agent
cp .env.example .env
# edite com credenciais do MariaDB e o mesmo PABX_AGENT_SECRET do painel
npm install --omit=dev
node server.js   # ou via systemd (systemd/pabx-agent.service)
```

Coloque um Nginx + Let's Encrypt na frente para expor em HTTPS público
(`PABX_AGENT_URL`). Detalhes em `pabx-agent/README.md`.

---

## 6. Build e produção

```bash
npm run build         # gera .output/ (SSR bundle)
npm run preview       # testa o build localmente
```

Deploy:

- **VPS Linux:** rode `npm run preview` (ou `node .output/server/index.mjs`)
  atrás de Nginx/Caddy com HTTPS. Use systemd para manter no ar.
- **Vercel / Netlify / Cloudflare Pages:** detectam Vite + TanStack Start
  automaticamente. Defina todas as variáveis de ambiente do passo 3 no painel
  da plataforma.
- **Docker:** monte uma imagem `node:20-alpine`, copie `.output/`, exponha a
  porta `3000` e configure variáveis via `-e` ou `env_file`.

---

## 7. Integrações externas em uso

| Integração          | Para quê                                  | Como substituir / hospedar você mesmo                                          |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| **Supabase**        | Postgres, Auth, RLS                       | supabase.com (gerenciado) **ou** Supabase self-hosted (Docker) **ou** Postgres puro + GoTrue + PostgREST |
| **Lovable Cloud**   | Apenas um “wrapper” do Supabase no editor | Não precisa — leve seu projeto Supabase próprio. Nenhum código depende da Lovable em runtime. |
| **Lovable AI Gateway** | Não usado neste projeto                | —                                                                              |
| **mini-agente PABX**| Acesso ao MariaDB do Asterisk             | Já é seu — código em `pabx-agent/`, roda no seu servidor                       |
| **MariaDB/MySQL**   | Realtime do Asterisk                      | Seu próprio servidor Asterisk                                                  |

Não há outras integrações de terceiros (sem Stripe, OpenAI, Resend, etc.).

---

## 8. Saindo do Lovable — passos práticos

1. **GitHub:** no editor Lovable, abra o menu **+** (canto inferior esquerdo)
   → **GitHub** → **Connect project** → autorize o GitHub App da Lovable →
   escolha sua org → **Create Repository**. A partir daí, todo commit feito
   no Lovable vai pro seu repo e vice-versa. Quando estiver tudo no GitHub,
   pode parar de usar o Lovable a qualquer momento — o código continua seu.

2. **Banco de dados:** o projeto Supabase usado pela Lovable Cloud não expõe
   ao usuário a `service_role` nem a senha do Postgres. Para ter controle
   total, **crie um projeto Supabase próprio** (em supabase.com ou
   self-hosted) e rode as migrations de `supabase/migrations/` nele. Exporte
   os dados que quiser manter via Cloud → Database → Tables → Export (CSV) e
   reimporte no banco novo.

3. **Variáveis:** preencha `.env` com a URL/keys do **seu** novo projeto
   Supabase e o `SUPABASE_SERVICE_ROLE_KEY` (disponível no painel Supabase
   próprio → Settings → API).

4. **Agente:** já roda no seu servidor — só ajustar `PABX_AGENT_URL` e
   `PABX_AGENT_SECRET` no `.env` do painel.

5. **Rodar:** `npm install && npm run dev`. Em produção, `npm run build &&
   npm run preview` atrás de Nginx.

Pronto — a partir daí o sistema é 100% seu, sem dependência da plataforma Lovable.
