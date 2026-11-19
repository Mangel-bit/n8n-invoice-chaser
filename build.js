// Builds the Invoice Chaser workflows into ./workflows from config.json and the Code files in ./nodes.
// Run: node build.js   then import each file with: n8n import:workflow --input=workflows/<file>.json
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const ROOT = __dirname;
const cfgAll = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const { credentials: CRED, ...CFG } = cfgAll;
const shared = fs.readFileSync(path.join(ROOT, 'nodes', '_shared.js'), 'utf8');
const prefix = `const CFG = ${JSON.stringify(CFG)};\n${shared}\n`;
const file = (f) => prefix + fs.readFileSync(path.join(ROOT, 'nodes', f), 'utf8');
// actions.js holds several small snippets separated by //@ markers.
const snippets = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'nodes', 'actions.js'), 'utf8')
  .split(/^\/\/@ /m).slice(1).map((s) => { const [name, ...rest] = s.split('\n'); return [name.trim(), prefix + rest.join('\n')]; }));

const INV_COLS = [['invoice_no', 's'], ['client_company', 's'], ['client_name', 's'], ['client_email', 's'], ['amount', 'n'], ['currency', 's'],
  ['issue_date', 's'], ['due_date', 's'], ['invoice_link', 's'], ['status', 's'], ['promised_date', 's'], ['reminders_sent', 'n'],
  ['next_action', 's'], ['last_update', 's'], ['ai_note', 's'], ['paid_date', 's']];
const ACT_COLS = [['invoice_no', 's'], ['at', 's'], ['kind', 's'], ['title', 's'], ['body', 's'], ['ai_note', 's']];
const MAIL_COLS = [['at', 's'], ['direction', 's'], ['invoice_no', 's'], ['from_name', 's'], ['to_addr', 's'], ['subject', 's'], ['body', 's']];
const colType = { s: 'string', n: 'number' };
const DEMO = CFG.emailMode === 'demo';

// ---------- node factories ----------
let x = 0;
const at = (col, row = 0) => [col * 240, row * 200];
const code = (name, src, pos) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos, parameters: { jsCode: src } });
const table = (t) => ({ __rl: true, mode: 'name', value: t });
const createTable = (name, t, cols, pos) => ({ name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos,
  parameters: { resource: 'table', operation: 'create', tableName: t, columns: { column: cols.map(([n, ty]) => ({ name: n, type: colType[ty] })) }, options: { createIfNotExists: true } } });
const getAll = (name, t, pos) => ({ name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos, executeOnce: true, alwaysOutputData: true,
  parameters: { resource: 'row', operation: 'get', dataTableId: table(t), matchType: 'anyCondition', filters: {}, returnAll: true } });
const insert = (name, t, pos) => ({ name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos,
  parameters: { resource: 'row', operation: 'insert', dataTableId: table(t), columns: { mappingMode: 'autoMapInputData', value: null }, options: {} } });
const update = (name, t, pos) => ({ name, type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: pos,
  parameters: { resource: 'row', operation: 'update', dataTableId: table(t), matchType: 'allConditions',
    filters: { conditions: [{ keyName: 'invoice_no', condition: 'eq', keyValue: '={{ $json.invoice_no }}' }] },
    columns: { mappingMode: 'autoMapInputData', value: null }, options: {} } });
const aiCall = (name, pos) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos, onError: 'continueRegularOutput',
  // Without a credential id in config.json, n8n asks you to pick your Anthropic credential on the node after import.
  ...(CRED.anthropic && CRED.anthropic.id ? { credentials: { anthropicApi: CRED.anthropic } } : {}),
  parameters: { method: 'POST', url: 'https://api.anthropic.com/v1/messages', authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
    sendHeaders: true, headerParameters: { parameters: [{ name: 'anthropic-version', value: '2026-10-21' }, { name: 'anthropic-beta', value: 'server-side-fallback-2026-07-01' }] },
    sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.aiBody) }}',
    options: { batching: { batch: { batchSize: 3, batchInterval: 300 } }, timeout: 180000 } } });
const email = (name, pos) => ({ name, type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, position: pos, webhookId: randomUUID(),
  ...(CRED.smtp ? { credentials: { smtp: CRED.smtp } } : {}),
  parameters: { operation: 'send', fromEmail: `"${CFG.business} Billing" <${CFG.mailbox}>`, toEmail: '={{ $json.to }}', subject: '={{ $json.subject }}',
    emailFormat: 'text', text: '={{ $json.body }}', options: { appendAttribution: false } } });
// "Send" is a real email in real mode, and a row in the Mailbox table in demo mode.
const sendNodes = (name, pos) => DEMO
  ? [code(`${name} · format`, snippets['to-mailbox'], pos), insert(name, 'Mailbox', [pos[0] + 240, pos[1]])]
  : [email(name, pos)];
const sendChain = (name) => (DEMO ? [`${name} · format`, name] : [name]);
const webhook = (name, method, p, mode, id, pos, extra = {}) => ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2.1, position: pos, webhookId: id,
  parameters: { httpMethod: method, path: p, responseMode: mode, options: {}, ...extra } });
const redirect = (name, to, pos) => ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: pos,
  parameters: { respondWith: 'text', responseBody: 'Redirecting…', options: { responseCode: 303, responseHeaders: { entries: [{ name: 'Location', value: to }] } } } });

const wf = (id, name, nodes, links) => {
  const connections = {};
  for (const [from, ...to] of links) connections[from] = { main: [to.map((n) => ({ node: n, type: 'main', index: 0 }))] };
  nodes.forEach((n) => { n.id = n.id || randomUUID(); });
  return { id, name, active: false, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {} };
};
const chain = (...names) => names.slice(0, -1).map((n, i) => [n, names[i + 1]]);

// ---------- 0. Setup (run once) ----------
const setup = wf('invChaserSetup01', 'Invoice Chaser · 0 Setup', [
  // The n8n CLI can't use Data Tables, so setup runs from links:
  //   POST /webhook/invoice-chaser-setup  creates the tables and adds demo data only if they are empty
  //   POST /webhook/invoice-chaser-reset  test mode only: wipes the tables and reloads the demo data
  webhook('Run setup (link)', 'POST', 'invoice-chaser-setup', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e600', at(0, -1)),
  webhook('Reset demo (link)', 'POST', 'invoice-chaser-reset', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e609', at(0, 1)),
  code('Only in test mode', prefix + 'if (!CFG.testMode) return [];\nreturn $input.all();', at(1, 1)),
  createTable('Create Invoices table', 'Invoices', INV_COLS, at(2, 1)),
  createTable('Create Activity table', 'Activity', ACT_COLS, at(3, 1)),
  createTable('Create Mailbox table', 'Mailbox', MAIL_COLS, at(4, 1)),
  { name: 'Clear invoices', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: at(5, 1), parameters: { resource: 'table', operation: 'clear', dataTableId: table('Invoices') } },
  { name: 'Clear activity', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: at(6, 1), parameters: { resource: 'table', operation: 'clear', dataTableId: table('Activity') } },
  { name: 'Clear mailbox', type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: at(7, 1), parameters: { resource: 'table', operation: 'clear', dataTableId: table('Mailbox') } },
  createTable('Create tables if missing', 'Invoices', INV_COLS, at(1, -1)),
  createTable('Create Activity if missing', 'Activity', ACT_COLS, at(2, -1)),
  createTable('Create Mailbox if missing', 'Mailbox', MAIL_COLS, at(3, -1)),
  getAll('Get invoices', 'Invoices', at(8)),
  code('Demo invoices (only if empty)', file('setup-seed.js'), at(9)),
  insert('Save invoices', 'Invoices', at(10)),
  code('Demo history', file('setup-seed-activity.js'), at(11)),
  insert('Save history', 'Activity', at(12)),
  code('Demo emails', file('setup-seed-mailbox.js'), at(13)),
  insert('Save emails', 'Mailbox', at(14)),
  redirect('Back to dashboard', '/webhook/invoices?done=reset', at(15)),
], [
  ...chain('Run setup (link)', 'Create tables if missing', 'Create Activity if missing', 'Create Mailbox if missing', 'Get invoices'),
  ...chain('Reset demo (link)', 'Only in test mode', 'Create Invoices table', 'Create Activity table', 'Create Mailbox table', 'Clear invoices', 'Clear activity', 'Clear mailbox', 'Get invoices'),
  ...chain('Get invoices', 'Demo invoices (only if empty)', 'Save invoices', 'Demo history', 'Save history', 'Demo emails', 'Save emails', 'Back to dashboard'),
]);

// ---------- 1. Daily chaser ----------
const chaser = wf('invChaserDaily01', 'Invoice Chaser · 1 Daily chaser', [
  { name: 'Every day 9:00', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: at(0, -1),
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * *' }] } } },
  webhook('Run now (from dashboard)', 'POST', 'invoice-chaser-run', 'lastNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e601', at(0, 1), { responseData: 'firstEntryJson' }),
  getAll('Get invoices', 'Invoices', at(1)),
  code('Pick invoices to chase', file('chaser-pick.js'), at(2)),
  aiCall('AI writes reminders', at(3)),
  code('Build emails', file('chaser-build.js'), at(4)),
  ...sendNodes('Send email', at(5)),
  code('Invoice updates', "return $('Build emails').all().map((i) => ({ json: i.json.update }));", at(7)),
  update('Update invoices', 'Invoices', at(8)),
  code('Activity entries', "return $('Build emails').all().map((i) => ({ json: i.json.activity }));", at(9)),
  insert('Log activity', 'Activity', at(10)),
], [['Every day 9:00', 'Get invoices'], ['Run now (from dashboard)', 'Get invoices'],
  ...chain('Get invoices', 'Pick invoices to chase', 'AI writes reminders', 'Build emails', ...sendChain('Send email'), 'Invoice updates', 'Update invoices', 'Activity entries', 'Log activity')]);

// ---------- 2. Reply reader ----------
// Two ways in: a real email (IMAP, real mode only) or a reply typed in the Client inbox. Both take the same path.
const replies = wf('invChaserReply01', 'Invoice Chaser · 2 Reply reader', [
  ...(DEMO ? [] : [{ name: 'New email', type: 'n8n-nodes-base.emailReadImap', typeVersion: 2.2, position: at(3, -1),
    ...(CRED.imap ? { credentials: { imap: CRED.imap } } : {}),
    parameters: { mailbox: 'INBOX', postProcessAction: 'read', format: 'simple', options: { customEmailConfig: '["UNSEEN", ["SUBJECT", "INV-"]]' } } }]),
  // The browser waits while the agent works, then gets ONE redirect to the updated conversation.
  // No polling and no background requests, so it works in any browser and with ad blockers.
  webhook('Reply from client inbox', 'POST', 'inbox-reply', 'lastNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e621', at(0, 1), {
    responseData: 'noData',
    options: {
      responseCode: { values: { responseCode: 'customCode', customCode: 303 } },
      // Fixed address on purpose: n8n can't read the request here. The inbox opens the newest conversation,
      // which is the one that was just answered.
      responseHeaders: { entries: [{ name: 'Location', value: '/webhook/inbox?new=1' }] },
    },
  }),
  code('Client message', snippets['reply-entry'], at(1, 1)),
  insert('Save client message', 'Mailbox', at(3, 1)),
  code('As an incoming email', snippets['reply-as-email'], at(4, 1)),
  code('Keep client replies', file('reply-keep.js'), at(5)),
  getAll('Get invoices', 'Invoices', at(6)),
  code('Prepare AI', file('reply-prepare.js'), at(7)),
  aiCall('AI reads the reply', at(8)),
  code('Decide', file('reply-decide.js'), at(9)),
  code('Invoice fields', 'return $input.all().map((i) => ({ json: i.json.fields }));', at(10)),
  update('Update invoices', 'Invoices', at(11)),
  code('Activity entries', "return $('Decide').all().flatMap((i) => i.json.activities.map((a) => ({ json: a })));", at(12)),
  insert('Log activity', 'Activity', at(13)),
  code('Emails to send', "return $('Decide').all().flatMap((i) => i.json.emails.map((e) => ({ json: e })));", at(14)),
  ...sendNodes('Send email', at(15)),
], [
  ...(DEMO ? [] : [['New email', 'Keep client replies']]),
  ...chain('Reply from client inbox', 'Client message', 'Save client message', 'As an incoming email', 'Keep client replies'),
  ...chain('Keep client replies', 'Get invoices', 'Prepare AI', 'AI reads the reply', 'Decide', 'Invoice fields', 'Update invoices', 'Activity entries', 'Log activity', 'Emails to send', ...sendChain('Send email')),
]);

// ---------- 3. Dashboard and Client inbox ----------
const page = (name, pos) => ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.5, position: pos,
  parameters: { respondWith: 'text', responseBody: '={{ $json.html }}', options: { responseCode: 200, responseHeaders: { entries: [
    { name: 'Content-Type', value: 'text/html; charset=utf-8' },
    // n8n serves pages in a sandbox, so the inbox's quiet background check counts as cross-origin and needs this.
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Cache-Control', value: 'no-store' },
  ] } } } });
const dash = wf('invChaserDash001', 'Invoice Chaser · 3 Dashboard', [
  webhook('Dashboard page', 'GET', 'invoices', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e611', at(0, 0)),
  getAll('Get invoices for page', 'Invoices', at(1, 0)),
  getAll('Get activity', 'Activity', at(2, 0)),
  code('Render dashboard', file('dashboard-render.js'), at(3, 0)),
  page('Send page', at(4, 0)),

  webhook('Add invoice', 'POST', 'invoices-add', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e612', at(0, 1)),
  code('Build invoice', snippets['add-invoice'], at(1, 1)),
  insert('Save invoice', 'Invoices', at(2, 1)),
  code('Created entry', snippets['add-activity'], at(3, 1)),
  insert('Log created', 'Activity', at(4, 1)),
  redirect('Back to dashboard (add)', '/webhook/invoices?done=add', at(5, 1)),

  webhook('Mark paid', 'POST', 'invoices-paid', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e613', at(0, 2)),
  code('Paid fields', snippets['mark-paid'], at(1, 2)),
  update('Update invoice', 'Invoices', at(2, 2)),
  code('Paid entry', snippets['paid-activity'], at(3, 2)),
  insert('Log paid', 'Activity', at(4, 2)),
  redirect('Back to dashboard (paid)', '/webhook/invoices?done=paid', at(5, 2)),

  webhook('Run chaser now', 'POST', 'invoices-run', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e614', at(0, 3)),
  { name: 'Start the chaser', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: at(1, 3), onError: 'continueRegularOutput', alwaysOutputData: true,
    parameters: { method: 'POST', url: 'http://localhost:5678/webhook/invoice-chaser-run', options: { timeout: 300000 } } },
  redirect('Back to dashboard (run)', '/webhook/invoices?done=run', at(2, 3)),

  webhook('Inbox page', 'GET', 'inbox', 'responseNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e615', at(0, 4)),
  getAll('Get invoices for inbox', 'Invoices', at(1, 4)),
  getAll('Get mailbox', 'Mailbox', at(2, 4)),
  getAll('Get activity for inbox', 'Activity', at(3, 4)),
  code('Render inbox', file('inbox-render.js'), at(4, 4)),
  page('Send inbox', at(5, 4)),
], [
  ...chain('Dashboard page', 'Get invoices for page', 'Get activity', 'Render dashboard', 'Send page'),
  ...chain('Add invoice', 'Build invoice', 'Save invoice', 'Created entry', 'Log created', 'Back to dashboard (add)'),
  ...chain('Mark paid', 'Paid fields', 'Update invoice', 'Paid entry', 'Log paid', 'Back to dashboard (paid)'),
  ...chain('Run chaser now', 'Start the chaser', 'Back to dashboard (run)'),
  ...chain('Inbox page', 'Get invoices for inbox', 'Get mailbox', 'Get activity for inbox', 'Render inbox', 'Send inbox'),
]);

// ---------- 4. Monday summary ----------
const weekly = wf('invChaserWeekly1', 'Invoice Chaser · 4 Monday summary', [
  { name: 'Mondays 8:00', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: at(0, -1),
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * 1' }] } } },
  webhook('Send it now (link)', 'POST', 'invoice-chaser-summary', 'lastNode', '6a1f2c3d-4b5e-4f60-8a71-92b3c4d5e631', at(0, 1), { responseData: 'firstEntryJson' }),
  getAll('Get invoices', 'Invoices', at(1)),
  code('Write summary', snippets.summary, at(2)),
  ...sendNodes('Send summary', at(3)),
], [['Mondays 8:00', 'Get invoices'], ['Send it now (link)', 'Get invoices'], ...chain('Get invoices', 'Write summary', ...sendChain('Send summary'))]);

fs.mkdirSync(path.join(ROOT, 'workflows'), { recursive: true });
for (const [f, w] of [['0-setup', setup], ['1-daily-chaser', chaser], ['2-reply-reader', replies], ['3-dashboard', dash], ['4-monday-summary', weekly]]) {
  fs.writeFileSync(path.join(ROOT, 'workflows', f + '.json'), JSON.stringify(w, null, 2));
}
console.log(`Built 5 workflows in ${DEMO ? 'DEMO' : 'REAL'} email mode. SMTP: ${!!CRED.smtp} · IMAP: ${!!CRED.imap}`);
