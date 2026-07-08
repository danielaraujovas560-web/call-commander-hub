# Migrar do Supabase (Lovable Cloud) para seu MariaDB / PostgreSQL

Este projeto usa dois bancos hoje:

1. **MariaDB do Asterisk** (já no seu servidor) — dados telefônicos: `ramais`,
   `troncos`, `filas`, `uras`, `cdr*`, `regra_horario`, etc.
   Acesso via `pabx-agent` (HTTP + HMAC).
2. **Supabase (Lovable Cloud)** — só o *identity plane* do painel:
   - `profiles` (nome/email do usuário logado)
   - `user_roles` (admin / cliente)
   - `tenants_link` (qual `tenant_id` cada usuário enxerga)
   - `clientes` (cadastro comercial do cliente)
   - `audit_log`
   - `auth.users` (do Supabase Auth — login por email/senha)

O que segue é o passo-a-passo para levar (1)+(2) inteiros pro **seu**
MariaDB ou PostgreSQL, e apontar o painel pra ele.

---

## 1. Escolha do banco

Recomendação: **PostgreSQL** para o painel (o schema atual é PG puro:
`gen_random_uuid()`, enums, RLS). MariaDB funciona, mas exige adaptações
(sem enum estilo PG, sem `gen_random_uuid()` nativo antes do 10.10, sem RLS).

Os scripts abaixo têm duas versões: **PostgreSQL** e **MariaDB 10.6+**.

---

## 2. Schema do painel

### 2.a — PostgreSQL

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE app_role AS ENUM ('admin', 'cliente');

CREATE TABLE profiles (
  id         UUID PRIMARY KEY,
  nome       TEXT,
  email      TEXT,
  senha_hash TEXT NOT NULL,            -- bcrypt ($2b$...)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE TABLE tenants_link (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id  INTEGER NOT NULL,
  label      TEXT,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tenants_link (user_id);
CREATE INDEX ON tenants_link (tenant_id);

CREATE TABLE clientes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          INTEGER NOT NULL UNIQUE,
  cnpj               TEXT NOT NULL,
  razao_social       TEXT NOT NULL,
  email              TEXT NOT NULL,
  login              TEXT,
  quantidade_ramais  INTEGER NOT NULL DEFAULT 0,
  user_id            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID,
  tenant_id  INTEGER,
  action     TEXT NOT NULL,
  payload    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **Removi** a lógica `handle_new_user` (primeiro usuário vira admin) e as
> policies de RLS do Supabase. Você fez questão de não ter isso — a permissão
> agora é feita no `pabx-agent` (ver seção 4).

### 2.b — MariaDB

```sql
CREATE TABLE profiles (
  id         CHAR(36) PRIMARY KEY,
  nome       VARCHAR(255),
  email      VARCHAR(255),
  senha_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
  id         CHAR(36) PRIMARY KEY DEFAULT UUID(),
  user_id    CHAR(36) NOT NULL,
  role       ENUM('admin','cliente') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_role (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE tenants_link (
  id         CHAR(36) PRIMARY KEY DEFAULT UUID(),
  user_id    CHAR(36) NOT NULL,
  tenant_id  INT NOT NULL,
  label      VARCHAR(255),
  is_default TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id), INDEX (tenant_id),
  CONSTRAINT fk_tl_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE clientes (
  id                CHAR(36) PRIMARY KEY DEFAULT UUID(),
  tenant_id         INT NOT NULL UNIQUE,
  cnpj              VARCHAR(20) NOT NULL,
  razao_social      VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  login             VARCHAR(255),
  quantidade_ramais INT NOT NULL DEFAULT 0,
  user_id           CHAR(36),
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE audit_log (
  id         CHAR(36) PRIMARY KEY DEFAULT UUID(),
  user_id    CHAR(36) NULL,
  tenant_id  INT NULL,
  action     VARCHAR(255) NOT NULL,
  payload    JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Exportar os dados atuais do Supabase

No painel do Lovable Cloud (menu → *Backend → Advanced settings → Export
data*) você baixa um dump SQL. Para PostgreSQL você importa direto:

```bash
psql "postgres://user:pass@seu-host/painel" < dump.sql
```

Para MariaDB, use os `INSERT`s do dump (as `CREATE TABLE` você já rodou na
seção 2) — a estrutura de linhas é compatível, só substitua UUIDs mantendo
os valores existentes para não quebrar `user_id` / `tenant_id`.

Se você tem `auth.users` do Supabase e quer manter as senhas, exporte
`auth.users(id, email, encrypted_password)`. O `encrypted_password` já é
bcrypt — cole direto em `profiles.senha_hash` (mesma coluna, mesmo formato).

---

## 4. Autenticação sem Supabase

O painel hoje pede token do Supabase e o `pabx-agent` roda com HMAC. A
proposta mais barata é **mover o login pro próprio `pabx-agent`** e
substituir o cliente Supabase no front por um cliente HTTP simples.

### 4.a — Endpoints novos no `pabx-agent`

Adicione (arquivo `pabx-agent/server.js`) três rotas — usam a lib `bcryptjs`
e `jsonwebtoken`:

```js
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET; // gere um bem grande

app.post("/auth/login", async (req, res) => {
  const { email, senha } = req.body || {};
  const [rows] = await pool.query(
    "SELECT id, nome, email, senha_hash FROM profiles WHERE email = ? LIMIT 1", [email]);
  if (!rows.length) return res.status(401).json({ error: "credenciais inválidas" });
  const u = rows[0];
  if (!await bcrypt.compare(senha, u.senha_hash))
    return res.status(401).json({ error: "credenciais inválidas" });
  const [[role]] = await pool.query(
    "SELECT role FROM user_roles WHERE user_id = ? ORDER BY role LIMIT 1", [u.id]);
  const token = jwt.sign({ sub: u.id, role: role?.role || "cliente" },
                         JWT_SECRET, { expiresIn: "12h" });
  res.json({ token, user: { id: u.id, nome: u.nome, email: u.email, role: role?.role } });
});

app.get("/auth/me", requireJwt, async (req, res) => {
  const [rows] = await pool.query("SELECT id, nome, email FROM profiles WHERE id = ?", [req.userId]);
  res.json({ user: rows[0], role: req.role });
});

function requireJwt(req, res, next) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "sem token" });
  try {
    const p = jwt.verify(m[1], JWT_SECRET);
    req.userId = p.sub; req.role = p.role;
    next();
  } catch { res.status(401).json({ error: "token inválido" }); }
}
```

E aplique `requireJwt` em vez do HMAC nas rotas de gerência do painel
(ou mantenha ambos: HMAC quando chamado pelo backend, JWT quando pelo
front — o middleware pode aceitar os dois).

### 4.b — No front (Lovable / TanStack Start)

Substitua `@/integrations/supabase/client` por um cliente próprio, por
exemplo `src/lib/api.ts`:

```ts
const API = import.meta.env.VITE_AGENT_URL;
export async function apiLogin(email: string, senha: string) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, senha }),
  });
  if (!r.ok) throw new Error("Login falhou");
  const { token, user } = await r.json();
  localStorage.setItem("pabx_token", token);
  return user;
}
export function apiFetch(path: string, init: RequestInit = {}) {
  const tok = localStorage.getItem("pabx_token");
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers||{}), authorization: `Bearer ${tok}` },
  });
}
```

E remova toda referência a `supabase.auth.*` — trocando por `apiLogin` na
tela `/auth` e por `apiFetch` no lugar das server functions que hoje usam
`requireSupabaseAuth`.

---

## 5. `pabx-agent` — apontar para o banco novo

O `pabx-agent` já usa MariaDB pros dados do Asterisk. Se você:

- **Ficou em MariaDB**: acrescente as tabelas da seção 2.b no *mesmo* banco.
  Nada muda em `.env`.
- **Foi pra PostgreSQL**: crie um segundo pool no `server.js`:
  ```js
  const { Pool } = require("pg");
  const pgPool = new Pool({ connectionString: process.env.PG_PAINEL_URL });
  ```
  e use `pgPool` só nas rotas `/auth/*`, `/tenants*`, `/clientes*`,
  `/user_roles*`. O restante (ramais, troncos, cdr) continua no `pool`
  MariaDB, porque é o banco do Asterisk.

---

## 6. Primeiro admin

Sem o `handle_new_user`, você cria o primeiro usuário à mão:

```sql
-- PostgreSQL
INSERT INTO profiles (id, email, nome, senha_hash)
VALUES (gen_random_uuid(), 'voce@empresa.com', 'Admin',
        crypt('senha-inicial', gen_salt('bf')));
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM profiles WHERE email = 'voce@empresa.com';
```

Para MariaDB, gere o bcrypt fora do banco (Node: `bcrypt.hashSync(...)`)
e cole no `senha_hash`.

---

## 7. Checklist de corte

- [ ] Schema criado no banco novo (seção 2)
- [ ] Dados importados do dump do Supabase (seção 3)
- [ ] `pabx-agent` com `/auth/login` + `requireJwt` (seção 4.a)
- [ ] Front usando `apiFetch`/`apiLogin` (seção 4.b) — sem `supabase.*`
- [ ] `.env` do front com `VITE_AGENT_URL` apontando pro agent
- [ ] Primeiro admin inserido (seção 6)
- [ ] `.env.example` do `pabx-agent`: `JWT_SECRET`, opcional `PG_PAINEL_URL`
- [ ] Desativar Lovable Cloud (Supabase) no painel do projeto

Depois disso, dá pra deletar `src/integrations/supabase/*`, `supabase/*` e
o pacote `@supabase/supabase-js` da `package.json`.
