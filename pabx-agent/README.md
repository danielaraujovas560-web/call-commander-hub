# pabx-agent

Mini-servidor HTTP que roda no **seu** servidor Asterisk e expõe o banco
MariaDB (ramais, troncos, ps_endpoints…) para o painel Lovable de forma
autenticada por HMAC.

> O painel **nunca** conecta direto no seu MariaDB. Toda comunicação passa
> por este agente, assinado com `AGENT_SECRET`.

## Requisitos

- Node.js 20+
- MariaDB/MySQL com as tabelas do realtime (`ramais`, `ps_endpoints`,
  `ps_auths`, `ps_aors`)
- Nginx (recomendado) para servir HTTPS

## Deploy

```bash
# 1) copie para o servidor
sudo mkdir -p /opt/pabx-agent
sudo cp -r server.js package.json /opt/pabx-agent/
cd /opt/pabx-agent
sudo npm install --omit=dev

# 2) configure o .env
sudo cp .env.example .env
sudo nano .env         # preencha DB_* e AGENT_SECRET
sudo chown asterisk:asterisk .env
sudo chmod 600 .env

# 3) systemd
sudo cp systemd/pabx-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pabx-agent
sudo systemctl status pabx-agent
journalctl -u pabx-agent -f
```

## Nginx (HTTPS)

```nginx
server {
  listen 443 ssl http2;
  server_name agente.seudominio.com.br;

  ssl_certificate     /etc/letsencrypt/live/agente.seudominio.com.br/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/agente.seudominio.com.br/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 30s;
  }
}
```

No painel Lovable, configure os secrets:
- `PABX_AGENT_URL = https://agente.seudominio.com.br`
- `PABX_AGENT_SECRET = <mesmo valor de AGENT_SECRET>`

## Segurança

- Toda requisição é assinada (HMAC-SHA256 sobre
  `timestamp.method.path.sha256(body)`).
- Janela anti-replay de 5 min (`SIGNATURE_WINDOW`).
- Rate limit: 120 req/min por IP.
- O agente injeta `WHERE tenant_id = ?` em toda query — sem header
  `X-Tenant-Id` o request é rejeitado.

## Endpoints

| Método | Path             | Descrição                              |
| ------ | ---------------- | -------------------------------------- |
| GET    | /health          | Ping (também valida o HMAC)            |
| GET    | /ramais          | Lista ramais do tenant                 |
| POST   | /ramais          | Cria ramal + ps_endpoints/auths/aors   |
| DELETE | /ramais/:id      | Remove ramal e endpoint SIP            |
| GET    | /troncos         | Lista troncos do tenant (dropdown UI)  |

Próximas fases adicionarão `/cdr/...`, `/troncos` (CRUD completo) e
`/audios` (upload).
