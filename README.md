# Etapa 3 — Nomes e mute real pelo ConfBridge

## O que muda
- Mostra o **nome cadastrado** da sala e seu **ramal de discagem**, em vez do nome técnico `cc-t1-i1`.
- Para salas temporárias sem ramal, mostra `Conferência temporária #ID`.
- Substitui o ícone estático de microfone no **painel** por botão que executa **AMI ConfbridgeMute/ConfbridgeUnmute** no canal escolhido. O evento AMI atualiza o indicador em tempo real.
- Usa nomes dos ramais cadastrados no banco para substituir `<unknown>` quando houver correspondência.
- Não mexe no mute local do Softphone, que é uma integração separada.

## Instalação
Na raiz de `~/call-commander-hub-dev`, **copie os arquivos do ZIP respeitando as pastas**, sobrescrevendo `src/components/monitoramento-conferencias.tsx`.

Execute:

```bash
python3 aplicar-etapa3.py
cd pabx-agent
node --check server.js
node --check routes/confbridge-controle.js
sudo systemctl restart pabx-agent-dev
```

No frontend, execute seu build/start habitual. Se quiser confirmar tipagem: `npx tsc --noEmit` (o repositório pode ter problemas de tipagem preexistentes).

**Atenção:** o `aplicar-etapa3.py` só acrescenta `app.use(require("./routes/confbridge-controle"))` depois de `app.use(conferencias)`, já dentro do trecho com JWT e resolução de tenant. Faz backup `server.js.bak-etapa3`.

## Testes
1. Abra Dashboard Conferências com uma sala ativa; confirme que mostra nome cadastrado e `Ramal XXXX`.
2. Confirme que, para participante registrado, aparece o nome do cadastro de ramais quando existir.
3. Clique no microfone de um participante. Um `ConfbridgeMute` deve ser enviado pelo backend, e o ícone mudará quando o AMI enviar `ConfbridgeMute`.
4. Clique novamente e confira `ConfbridgeUnmute`.
5. Teste com um segundo tenant: não deve conseguir controlar um canal de outra sala/tenant.

## Notas de segurança e limites
- A API aceita apenas sessão de usuário do painel (`authType = user`), **não** JWT de ramal. O backend resolve tenant via middleware; a sala é **reconstruída no servidor**, nunca aceita como nome livre do navegador.
- Antes do comando AMI, verifica o ID/tipo no banco e a participação exata do canal no monitor.
- O retorno OK representa o aceite da ação AMI, não a confirmação do estado. O evento AMI é a confirmação visual.
- O acesso é concedido a usuários do painel com acesso ao tenant; caso queira permissão específica por perfil para mute, adicione essa checagem antes da action.
- Se sua versão do `confbridgeMonitor.service.js` não estiver sincronizando canais, o botão retornará 409, sem mutar outra chamada.
