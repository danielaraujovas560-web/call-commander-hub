// Roda uma vez só: cria a identidade PJSIP "-web" pra cada ramal que ainda não tem.
require("dotenv").config();
const mysql = require("mysql2/promise");

const { DB_HOST = "127.0.0.1", DB_PORT = "3306", DB_USER = "asterisk", DB_PASSWORD = "", DB_NAME = "asterisk" } = process.env;

async function main() {
  const pool = mysql.createPool({ host: DB_HOST, port: Number(DB_PORT), user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
  const [ramais] = await pool.query("SELECT tenant_id, ramal, endpoint_id, senha FROM ramais");
  let criados = 0;
  for (const r of ramais) {
    const webId = `${r.endpoint_id}-web`;
    const [existe] = await pool.query("SELECT 1 FROM ps_endpoints WHERE id = ?", [webId]);
    if (existe.length) continue;

    await pool.query(`INSERT INTO ps_auths (id, username, password) VALUES (?, ?, ?)`, [`auth-${webId}`, webId, r.senha]);
    await pool.query(`INSERT INTO ps_aors (id) VALUES (?)`, [webId]);
    await pool.query(
      `INSERT INTO ps_endpoints (id, aors, auth, context, call_group, pickup_group, webrtc)
       VALUES (?, ?, ?, 'Internal-default', ?, ?, 1)`,
      [webId, webId, `auth-${webId}`, String(r.tenant_id), String(r.tenant_id)],
    );
    criados++;
    console.log(`criado: ${webId}`);
  }
  console.log(`Concluído. ${criados} identidades WebRTC criadas.`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
