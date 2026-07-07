# Status Online — Ramais e Troncos

O painel exibe **online/offline** para cada ramal e cada tronco. O backend
(`pabx-agent`) obtém isso do próprio Asterisk. Existem 3 formas possíveis
(qualquer uma serve — a mais simples já vem pronta):

## 1. Via CLI (`asterisk -rx`) — **é o que está ativo hoje**

O agent executa:

```
asterisk -rx "pjsip show endpoints"
```

e faz o parse. Não precisa configurar nada — só garantir que o usuário que
roda o agent tem permissão de rodar `asterisk -rx` (é o mesmo usuário que
já usamos hoje, geralmente `asterisk` ou `root`).

Regra de decisão:

- Estado do endpoint = `Unavailable` → **offline** 🔴
- Estado do endpoint = `Unknown` (ou coluna em branco) → **unknown** ⚪
- Qualquer outro (`Not in use`, `In use`, `Ringing`, `Busy`, `Available`) → **online** 🟢

## 2. Via AMI (Asterisk Manager Interface) — recomendado se quiser tempo-real

AMI é uma conexão TCP com login/senha em `/etc/asterisk/manager.conf`.
Para habilitar, no servidor Asterisk:

```ini
; /etc/asterisk/manager.conf
[general]
enabled  = yes
port     = 5038
bindaddr = 127.0.0.1     ; só localhost — mesmo host do pabx-agent

[pabx-agent]
secret        = TROQUE-POR-UMA-SENHA-FORTE
deny          = 0.0.0.0/0.0.0.0
permit        = 127.0.0.1/255.255.255.255
read          = system,call,agent,user,command,reporting
write         = system,call,agent,user,command
```

Depois:

```
asterisk -rx "manager reload"
```

E no `.env` do `pabx-agent`:

```
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USER=pabx-agent
AMI_PASSWORD=TROQUE-POR-UMA-SENHA-FORTE
```

Com AMI, o comando é `PJSIPShowEndpoints` (ou `Action: DeviceStateList`), e
o agent pode manter uma conexão persistente para receber eventos
`ContactStatus` em tempo real.

## 3. Via ARI (Asterisk REST Interface) — moderna, JSON puro

ARI expõe `GET /ari/endpoints` retornando JSON. Precisa:

```ini
; /etc/asterisk/ari.conf
[general]
enabled = yes
pretty  = yes

[pabx-agent]
type     = user
read_only = yes
password = TROQUE-POR-UMA-SENHA-FORTE
```

```ini
; /etc/asterisk/http.conf
[general]
enabled  = yes
bindaddr = 127.0.0.1
bindport = 8088
```

Depois `module reload res_ari.so` e `module reload res_http_websocket.so`.

O painel pode continuar chamando o `pabx-agent` — ele proxya pro ARI.

---

## O que o script faz hoje

`GET /ramais/status?tenant=N` retorna:

```json
{ "endpoints": { "t1-daniel": "Not in use", "t1-joao": "Unavailable" } }
```

`GET /troncos/status?tenant=N` retorna o mesmo formato para os endpoints de
tronco.

O front-end pega esses estados e pinta bolinha verde/vermelha. Não é
tempo-real — o painel atualiza a cada refresh (~10s por polling).

Se um dia quiser evoluir para tempo real, migre pra AMI ou ARI seguindo os
blocos acima. O contrato de retorno do agent não muda.
