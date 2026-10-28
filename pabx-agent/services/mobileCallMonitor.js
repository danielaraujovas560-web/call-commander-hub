const { onCallEvent } = require('../ami');
const pool = require('../config/db');
const { cancelIncomingCall } = require('../routes/mobilePush');

let unsubscribe = null;

function iniciarMobileCallMonitor() {
  if (unsubscribe) return unsubscribe;

  unsubscribe = onCallEvent((event) => {
    const nome = event.event || event.Event;
    if (nome !== 'DialEnd') return;

    const destino = String(event.destchannel || event.DestChannel || '');
    const match = destino.match(/^Local\/(\d+)@ramal-mobile-[^;]+;1$/);
    if (!match) return;

    const status = String(event.dialstatus || event.DialStatus || '').toUpperCase();
    const callId = String(event.linkedid || event.Linkedid || '');
    const ramal = match[1];
    if (!callId) return;

    console.log('[MOBILE AMI] Fim da perna:', { callId, ramal, status });

    // Apenas estados que encerram a tentativa sem atendimento pelo mobile.
    if (!['CANCEL', 'NOANSWER', 'BUSY', 'CHANUNAVAIL', 'CONGESTION', 'ABORT'].includes(status)) return;

    // Callback AMI não aguarda Firebase: evita bloquear outros eventos.
    void cancelIncomingCall({ pool, ramal, callId }).catch(error => {
      console.error('[MOBILE CANCEL] Erro:', error.message || error);
    });
  });

  return unsubscribe;
}

module.exports = { iniciarMobileCallMonitor };
