// Picks the invoices whose next step is due today and asks Claude to write each email.
const rows = $input.all().map((i) => i.json).filter((r) => r.invoice_no);

const TONE = {
  heads_up: 'A friendly heads-up a few days before the due date. Light and helpful, no pressure. Ask them to say if they need anything (a PO number, a different format).',
  friendly: 'The invoice is due or a few days overdue. Warm and polite. Assume it slipped through the cracks. Ask when they expect to pay.',
  clear: 'About a week or more overdue. Still polite, but clear and direct about the amount and how late it is. Ask for a payment date.',
  firm: 'Two weeks or more overdue, after several reminders. Firm and professional, never threatening. Ask them to pay or reply with a date this week, and offer a quick call if something is wrong.',
  broken_promise: 'The client promised to pay by a date that has now passed. Polite. Mention their promise and the date specifically, and ask for an updated date.',
  escalate: 'This is an INTERNAL note to the business owner, not to the client. Several reminders got no payment. In 2-3 sentences summarize the situation and suggest the next human step, such as a phone call.',
};

const SYSTEM = `You write payment reminder emails for ${CFG.business}, sent as ${CFG.ownerName}.

${VOICE}

Rules for these emails:
- Plain text only, no markdown, 50 to 120 words for the body, and a new line is fine where he would pause.
- Always include the invoice number, the amount, the due date and the payment link.
- Never threaten, and never mention legal action, late fees, collections or credit. No guilt-tripping.
- Greet the contact by first name if given, otherwise "Hey there".
- Unless the stage says otherwise, end by asking when they expect to pay, because replies are read and handled.
- Sign off with "Thanks," then "${CFG.ownerName}" on the next line.
- For an internal note to the owner, write it the way he'd jot a note to himself: plain and connected, no greeting and no sign-off.
- subject: short and specific (3 to 8 words), in his plain style. Don't add the invoice tag in brackets, it's added automatically.`;

const SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
};

const due = rows.filter((r) => ['unpaid', 'promised'].includes(r.status) && isDate(r.next_action) && r.next_action <= today);
if (!due.length) return [];

return due.map((r) => {
  const late = daysBetween(r.due_date, today); // positive = overdue
  const sent = Number(r.reminders_sent) || 0;
  let stage;
  if (r.status === 'promised') stage = 'broken_promise';
  else if (sent >= 4) stage = 'escalate';
  else if (late < 0) stage = 'heads_up';
  else if (late < 7) stage = 'friendly';
  else if (late < 14) stage = 'clear';
  else stage = 'firm';

  const facts = `Invoice: ${r.invoice_no}
Client company: ${r.client_company}
Contact name: ${r.client_name || '(unknown)'}
Amount: ${money(r.amount, r.currency)}
Issued: ${fmtDate(r.issue_date)}
Due: ${fmtDate(r.due_date)} (${late > 0 ? late + ' days overdue' : late === 0 ? 'due today' : 'due in ' + -late + ' days'})
Reminders already sent: ${sent}
${r.status === 'promised' ? `They promised to pay by: ${fmtDate(r.promised_date)} (${weekday(r.promised_date)})\n` : ''}Payment link: ${r.invoice_link || CFG.paymentLink}
Today: ${fmtDate(today)} (${weekday(today)})

Stage and tone: ${TONE[stage]}`;

  return {
    json: {
      invoice: r,
      stage,
      late,
      claudeBody: {
        model: CFG.claudeModel,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content: facts }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        fallbacks: 'default',
      },
    },
  };
});
