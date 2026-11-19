// Matches each reply to its invoice and asks the AI what the client means.
const invoices = $('Get invoices').all().map((i) => i.json).filter((r) => r.invoice_no);
const replies = $('Keep client replies').all().map((i) => i.json);

const LABELS = ['promise_to_pay', 'says_paid', 'lost_invoice', 'dispute', 'question', 'out_of_office', 'other'];

const SYSTEM = `You read a client's email reply about an unpaid invoice for ${CFG.business} and decide what it means, so the right thing happens automatically.
Labels:
- promise_to_pay: they say when they will pay (a date, a weekday, "end of month", "next week").
- says_paid: they say they already paid or the payment is on its way.
- lost_invoice: they can't find the invoice, need it resent, or need a different format or details to pay.
- dispute: they question the amount, the work, or refuse to pay all or part of it.
- question: any other question that needs a human answer.
- out_of_office: an automatic away message.
- other: anything else.
Rules:
- promised_date: if they give any timing for payment, resolve it to a YYYY-MM-DD date using today's date given below. Otherwise "".
- summary: one sentence, what the client said.
- reasoning: one sentence for the owner's dashboard explaining what you understood and why, written like a quick note to him ("He says finance pays on Fridays, so I took that as a promise for this Friday").
- client_reply: a short plain-text reply (35 to 80 words) written as ${CFG.ownerName}, ending with "Thanks," then "${CFG.ownerName}" on the next line.
  promise_to_pay: thank them and confirm the date in words. says_paid: thank them and say you'll confirm once it shows up on your side. lost_invoice: say sorry briefly and that the link is below (it's added automatically). question: a helpful draft answer (the owner reviews it before anything is sent). For dispute, out_of_office and other: "".
- owner_message: for says_paid, dispute, question and other, 1 to 2 connected sentences telling the owner what happened and what he should do. Otherwise "".
- Be careful: when unsure between dispute and something milder, choose dispute, because a wrong "promise" is worse than asking the owner.

${VOICE}`;

const SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', enum: LABELS },
    promised_date: { type: 'string' },
    summary: { type: 'string' },
    reasoning: { type: 'string' },
    client_reply: { type: 'string' },
    owner_message: { type: 'string' },
  },
  required: ['label', 'promised_date', 'summary', 'reasoning', 'client_reply', 'owner_message'],
  additionalProperties: false,
};

const out = [];
for (const rep of replies) {
  const inv = invoices.find((r) => r.invoice_no === rep.invoice_no);
  if (!inv) continue;
  const content = `Today: ${today} (${weekday(today)})
Invoice ${inv.invoice_no} to ${inv.client_company}${inv.client_name ? ' (contact: ' + inv.client_name + ')' : ''}
Amount: ${money(inv.amount, inv.currency)} · due ${inv.due_date} · status: ${inv.status}${inv.promised_date ? ' · earlier promise: ' + inv.promised_date : ''}
Reminders sent so far: ${inv.reminders_sent || 0}

Reply from ${rep.from_name}:
"""
${rep.text}
"""`;
  out.push({
    json: {
      reply: rep,
      invoice: inv,
      aiBody: {
        model: CFG.aiModel,
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        fallbacks: 'default',
      },
    },
  });
}
return out;
