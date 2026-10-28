const express = require('express');
const { getMessaging } = require('firebase-admin/messaging');
const { iniciarFirebase } = require('../services/firebase');

// Compartilhado entre a rota interna de push e o monitor AMI, neste processo Node.
// Chave por tentativa e ramal; o tenant fica guardado no registro autenticado.
const activeCalls = new Map();
const endedCalls = new Map();
const CALL_TTL_MS = 90_000;

function callKey(ramal, callId) {
  return `${String(callId)}|${String(ramal)}`;
}

function clearExpired() {
  const now = Date.now();
  for (const [key, item] of activeCalls) {
    if (now - item.createdAt > CALL_TTL_MS) activeCalls.delete(key);
  }
  for (const [key, at] of endedCalls) {
    if (now - at > CALL_TTL_MS) endedCalls.delete(key);
  }
}

function createMobilePushRouter({ pool }) {
  const router = express.Router();
  router.use((req, res, next) => {
    if (req.authType !== 'ramal' || !req.ramalEndpointId || !req.ramalTenantId) {
      return res.status(403).json({ error: 'JWT de ramal obrigatório' });
    }
    next();
  });

  router.put('/devices', async (req, res) => {
    const tenantId = req.ramalTenantId;
    const ramal = String(req.ramalEndpointId);
    const { deviceId, token } = req.body || {};
    if (typeof deviceId !== 'string' || !/^[a-zA-Z0-9._:-]{8,128}$/.test(deviceId))
      return res.status(400).json({ error: 'deviceId inválido' });
    if (typeof token !== 'string' || token.length < 40 || token.length > 512 || /\s/.test(token))
      return res.status(400).json({ error: 'Token FCM inválido' });
    try {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await connection.execute(
          'DELETE FROM softphone_mobile_devices WHERE device_id = ? OR fcm_token = ?',
          [deviceId, token]
        );
        await connection.execute(
          `INSERT INTO softphone_mobile_devices
           (tenant_id, ramal, device_id, fcm_token, enabled, last_seen_at)
           VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
          [tenantId, ramal, deviceId, token]
        );
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally { connection.release(); }
      return res.json({ ok: true, ramal });
    } catch (err) {
      console.error('[FCM] Cadastro:', err.code || err.message);
      return res.status(500).json({ error: 'Falha ao cadastrar dispositivo' });
    }
  });

  router.delete('/devices/:deviceId', async (req, res) => {
    try {
      await pool.execute(
        'DELETE FROM softphone_mobile_devices WHERE tenant_id = ? AND ramal = ? AND device_id = ?',
        [req.ramalTenantId, String(req.ramalEndpointId), req.params.deviceId]
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('[FCM] Exclusão:', err.code || err.message);
      return res.status(500).json({ error: 'Falha ao remover dispositivo' });
    }
  });
  return router;
}

async function getDevices(pool, tenantId, ramal) {
  const [devices] = await pool.execute(
    'SELECT id, fcm_token FROM softphone_mobile_devices WHERE tenant_id = ? AND ramal = ? AND enabled = 1',
    [tenantId, String(ramal)]
  );
  return devices;
}

async function sendToToken(pool, tenantId, device, data, ttl) {
  try {
    const messageId = await getMessaging().send({
      token: device.fcm_token,
      data,
      android: { priority: 'high', ttl }
    });
    return { deviceId: device.id, ok: true, messageId };
  } catch (err) {
    const code = err.code || 'unknown';
    if (code === 'messaging/registration-token-not-registered') {
      // Evita desabilitar um token que foi atualizado durante o envio.
      await pool.execute(
        'UPDATE softphone_mobile_devices SET enabled = 0 WHERE id = ? AND tenant_id = ? AND fcm_token = ?',
        [device.id, tenantId, device.fcm_token]
      ).catch(e => console.error('[FCM] Falha desabilitando token:', e.message));
    }
    return { deviceId: device.id, ok: false, code };
  }
}

async function sendIncomingCallToRamal({ pool, tenantId, ramal, callId, caller, callerName = '', callerNumber = '' }) {
  if (!tenantId || !ramal || !callId) throw new Error('tenantId, ramal e callId obrigatórios');
  const key = callKey(ramal, callId);
  clearExpired();
  if (endedCalls.has(key)) {
    console.log('[FCM] Push ignorado: chamada já encerrada', { ramal, callId });
    return [];
  }
  const record = { tenantId, ramal: String(ramal), callId: String(callId), createdAt: Date.now(), ended: false };
  activeCalls.set(key, record);
  const devices = await getDevices(pool, tenantId, ramal);
  iniciarFirebase();
  const results = [];
  for (const device of devices) {
    if (record.ended || endedCalls.has(key)) break;
    const result = await sendToToken(pool, tenantId, device, {
      type: 'incoming_call',
      ramal: String(ramal),
      callId: String(callId),
      call_id: String(callId),
      callerName: String(callerName || ''),
      callerNumber: String(callerNumber || caller || ''),
      caller: String(callerNumber || caller || '')
    }, 30000);
    results.push(result);
    // Se o DialEnd ocorreu durante o send(), repassa CANCEL após o INCOMING.
    if (record.ended && result.ok) {
      await sendToToken(pool, tenantId, device, {
        type: 'cancel_call', callId: String(callId), call_id: String(callId), ramal: String(ramal)
      }, 30000);
    }
  }
  return results;
}

async function cancelIncomingCall({ pool, ramal, callId }) {
  const key = callKey(ramal, callId);
  clearExpired();
  endedCalls.set(key, Date.now());
  const record = activeCalls.get(key);
  if (!record || record.ended) return { matched: false };
  record.ended = true;
  activeCalls.delete(key);
  iniciarFirebase();
  const devices = await getDevices(pool, record.tenantId, record.ramal);
  const results = await Promise.all(devices.map(device => sendToToken(
    pool, record.tenantId, device,
    { type: 'cancel_call', callId: String(callId), call_id: String(callId), ramal: String(ramal) },
    30000
  )));
  console.log('[MOBILE CANCEL] FCM enviado:', { ramal, callId, results });
  return { matched: true, results };
}

module.exports = { createMobilePushRouter, sendIncomingCallToRamal, cancelIncomingCall };
