// Turns the AI's drafts into emails, plus the invoice update and activity entry for each.
// If the AI fails, a plain template is used so a reminder is never skipped.
const picks = $('Pick invoices to chase').all();
const answers = $input.all();

const STAGE_LABEL = { heads_up: 'heads-up', friendly: 'friendly', clear: 'clear', firm: 'firm', broken_promise: 'missed promise', escalate: 'escalated to you' };

const parse = (r) => {
  try {
    if (!r || r.stop_reason === 'refusal') return null;
    const t = (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const a = JSON.parse(t);
    return a.subject && a.body ? a : null;
  } catch { return null; }
};

const template = (inv, stage, late) => {
  const first = (inv.client_name || '').split(' ')[0] || 'there';
  if (stage === 'escalate') return {
    subject: `${inv.client_company} still hasn't paid ${inv.invoice_no}`,
    body: `${inv.client_company} still owes ${money(inv.amount, inv.currency)} on ${inv.invoice_no}, it's ${late} days late now and ${inv.reminders_sent} reminders didn't get a payment or a date, so I stopped emailing them and honestly a quick call from you is the best next step here.`,
  };
  return {
    subject: late < 0 ? `Heads up on invoice ${inv.invoice_no}` : `Quick follow up on ${inv.invoice_no}`,
    body: `Hey ${first},\n\nhope you're doing well, I just wanted to follow up on invoice ${inv.invoice_no} for ${money(inv.amount, inv.currency)}, ${late < 0 ? 'which is due on ' + fmtDate(inv.due_date) : 'which was due on ' + fmtDate(inv.due_date) + ' and might have slipped through'}, so here's the link again in case you need it: ${inv.invoice_link || CFG.paymentLink}\n\nCould you let me know when you're expecting to pay it? And if anything's holding it up just tell me and I'll help.\n\nThanks,\n${CFG.ownerName}`,
  };
};

return picks.map((p, i) => {
  const { invoice: inv, stage, late } = p.json;
  const ai = parse(answers[i] && answers[i].json);
  const draft = ai || template(inv, stage, late);
  const escalate = stage === 'escalate';
  const subject = `${draft.subject.replace(/\[INV-\d+\]/gi, '').trim()} ${tag(inv.invoice_no)}`;
  const to = escalate ? CFG.mailbox : recipient(inv.client_email, inv.client_company);
  const sent = (Number(inv.reminders_sent) || 0) + (escalate ? 0 : 1);

  const next = escalate ? '' : stage === 'heads_up' ? inv.due_date : addDays(today, stage === 'broken_promise' ? 4 : 5);
  const note = escalate
    ? `${sent} reminders and still no payment or date, so I stopped emailing them and it really needs a call from you`
    : `Sent reminder #${sent} in a ${STAGE_LABEL[stage]} tone, and if nothing comes back I'll follow up ${next === today ? 'today' : 'on ' + fmtDate(next)}`;

  return {
    json: {
      to,
      subject: escalate ? `Needs you: ${subject}` : subject,
      body: draft.body,
      update: {
        invoice_no: inv.invoice_no,
        status: escalate ? 'escalated' : 'unpaid',
        promised_date: stage === 'broken_promise' ? '' : (inv.promised_date || ''),
        reminders_sent: sent,
        next_action: next,
        last_update: today,
        ai_note: note,
      },
      activity: {
        invoice_no: inv.invoice_no,
        at: nowIso,
        kind: escalate ? 'alert' : 'sent',
        title: escalate ? 'Flagged for you, no payment after all the reminders' : subject,
        body: draft.body,
        ai_note: `${ai ? 'Written by AI' : 'Used the backup template because the AI was down'} · ${STAGE_LABEL[stage]} tone${CFG.testMode && !DEMO && !escalate ? ' · test mode: sent to ' + to : ''}`,
      },
    },
  };
});
