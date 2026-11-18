// Small Code nodes for the dashboard buttons and the Monday summary. build.js picks one with //@ markers.

//@ add-invoice
const b = $input.first().json.body || {};
const due = isDate(b.due_date) ? b.due_date : addDays(today, 14);
const inv = String(b.invoice_no || '').trim().toUpperCase() || `INV-${Math.floor(1000 + Math.random() * 9000)}`;
const firstStep = addDays(due, -3) <= today ? today : addDays(due, -3);
return [{ json: {
  invoice_no: inv.startsWith('INV-') ? inv : `INV-${inv}`,
  client_company: String(b.client_company || 'New client').trim(),
  client_name: String(b.client_name || '').trim(),
  client_email: String(b.client_email || '').trim(),
  amount: Number(String(b.amount || '0').replace(/[^0-9.]/g, '')) || 0,
  currency: CFG.currency, issue_date: today, due_date: due,
  invoice_link: String(b.invoice_link || '').trim() || CFG.paymentLink,
  status: 'unpaid', promised_date: '', reminders_sent: 0, next_action: firstStep, last_update: today, paid_date: '',
  ai_note: `Got it, I'll ${firstStep === today ? 'send the first reminder on the next run' : 'send a friendly heads-up on ' + fmtDate(firstStep)} and take it from there`,
} }];

//@ add-activity
const r = $('Build invoice').first().json;
return [{ json: { invoice_no: r.invoice_no, at: nowIso, kind: 'created', title: 'Invoice added', body: `${money(r.amount, r.currency)} due ${fmtDate(r.due_date)}`, ai_note: r.ai_note } }];

//@ mark-paid
const b = $input.first().json.body || {};
return [{ json: { invoice_no: String(b.invoice_no || ''), status: 'paid', paid_date: today, next_action: '', last_update: today, ai_note: "You marked it paid, so it's done and I stopped all the reminders" } }];

//@ paid-activity
const r = $('Paid fields').first().json;
return [{ json: { invoice_no: r.invoice_no, at: nowIso, kind: 'paid', title: 'Marked as paid', body: 'You confirmed the payment came in.', ai_note: '' } }];

//@ to-mailbox
// Demo mode: instead of sending, every outgoing email is saved to the Mailbox table.
const rows = $input.all().map((i) => i.json);
return rows.map((e) => ({ json: {
  at: nowIso,
  direction: e.to === CFG.mailbox ? 'owner' : 'out',
  invoice_no: (String(e.subject).match(/INV-\d+/) || [''])[0],
  from_name: `${CFG.business} Billing`,
  to_addr: e.to,
  subject: e.subject,
  body: e.body,
} }));

//@ reply-entry
// A reply typed in the Client inbox, saved like a received email.
const b = $input.first().json.body || {};
return [{ json: {
  at: nowIso, direction: 'in', invoice_no: String(b.invoice_no || ''), from_name: String(b.from_name || 'Client'),
  to_addr: CFG.mailbox, subject: /^re:/i.test(b.subject || '') ? b.subject : `Re: ${b.subject || ''}`, body: String(b.text || '').trim(),
} }];

//@ reply-as-email
// Shapes the typed reply exactly like an email from the inbox, so it takes the same path as a real one.
const m = $('Save client message').first().json;
const b = $('Reply from client inbox').first().json.body || {};
return [{ json: { subject: m.subject, from: `${m.from_name} <${b.from_email || 'client@example.com'}>`, to: CFG.mailbox, textPlain: m.body, date: nowIso } }];

//@ summary
const rows = $input.all().map((i) => i.json).filter((r) => r.invoice_no);
const open = rows.filter((r) => r.status !== 'paid');
const total = open.reduce((s, r) => s + (Number(r.amount) || 0), 0);
const line = (r) => `• ${r.invoice_no} · ${r.client_company} · ${money(r.amount, r.currency)} · ${daysBetween(r.due_date, today) > 0 ? daysBetween(r.due_date, today) + ' days late' : 'due ' + fmtDate(r.due_date)}`;
const needs = open.filter((r) => ['disputed', 'needs_you', 'check_payment', 'escalated'].includes(r.status));
const promised = open.filter((r) => r.status === 'promised');
const chasing = open.filter((r) => r.status === 'unpaid');
const weekAgo = addDays(today, -7);
const paid = rows.filter((r) => r.status === 'paid' && r.paid_date >= weekAgo);
const paidTotal = paid.reduce((s, r) => s + (Number(r.amount) || 0), 0);
const body = `Morning ${CFG.ownerName}, hope you had a good weekend

right now you're owed ${money(total)} across ${open.length} invoice${open.length === 1 ? '' : 's'}, ${needs.length ? `and ${needs.length} of them really need you this week` : "and honestly nothing needs you this week, I've got all of it"}${paid.length ? `, and the good news is ${money(paidTotal)} came in over the last 7 days` : ''}

NEEDS YOU (${needs.length})
${needs.map((r) => line(r) + `\n  ${r.ai_note}`).join('\n') || '• Nothing, all good'}

PROMISED (${promised.length})
${promised.map((r) => line(r) + ` · they said ${fmtDate(r.promised_date)}`).join('\n') || '• Nobody gave a date yet'}

STILL CHASING (${chasing.length})
${chasing.map((r) => line(r) + ` · next reminder ${fmtDate(r.next_action)}`).join('\n') || '• Nothing left to chase'}

Everything's on the dashboard if you want the details: http://localhost:5678/webhook/invoices
`;
return [{ json: { to: CFG.mailbox, subject: `Your money this week: ${money(total)} still out`, body } }];
