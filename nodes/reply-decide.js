// Decides what happens for each reply. The AI only labels the reply; the actions are fixed rules here,
// so the agent can never mark an invoice paid or argue with a client on its own.
const preps = $('Prepare AI').all().map((i) => i.json);
const answers = $input.all().map((i) => i.json);

const parse = (r) => {
  try {
    if (!r || r.stop_reason === 'refusal') return null;
    return JSON.parse((r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
  } catch { return null; }
};

const LABEL_TEXT = {
  promise_to_pay: 'Promise to pay', says_paid: 'Says it is paid', lost_invoice: 'Needs the invoice again',
  dispute: 'Dispute', question: 'Question', out_of_office: 'Out of office', other: 'Unclear',
};

return preps.map((p, i) => {
  const { reply, invoice: inv } = p;
  const ai = parse(answers[i]) || {
    label: 'other', promised_date: '', summary: reply.text.slice(0, 140),
    reasoning: "The AI couldn't read this one properly, so I'm leaving it to you instead of guessing",
    client_reply: '', owner_message: "I couldn't make sense of this reply, so it's better if you read it yourself",
  };
  let label = ai.label;
  const f = { invoice_no: inv.invoice_no, last_update: today };
  let note = ai.reasoning;
  let sendClient = '';
  let alertOwner = '';

  if (label === 'promise_to_pay') {
    if (isDate(ai.promised_date) && ai.promised_date >= today) {
      Object.assign(f, { status: 'promised', promised_date: ai.promised_date, next_action: addDays(ai.promised_date, 1) });
      note = `They promised to pay on ${weekday(ai.promised_date)} ${fmtDate(ai.promised_date)}, so I paused the reminders and I'll only check back on ${fmtDate(addDays(ai.promised_date, 1))} if it doesn't come in`;
      sendClient = ai.client_reply;
    } else {
      label = 'question';
      Object.assign(f, { status: 'needs_you', next_action: '' });
      note = "They talked about paying but didn't give a clear date, so I'm leaving this one to you";
      alertOwner = `${inv.client_company} replied about paying ${inv.invoice_no} but without a clear date, they said: "${ai.summary}"`;
    }
  } else if (label === 'says_paid') {
    Object.assign(f, { status: 'check_payment', next_action: '' });
    note = "They say it's paid, so I stopped the reminders, just check your bank and mark it paid once it shows up";
    sendClient = ai.client_reply;
    alertOwner = ai.owner_message || `${inv.client_company} says ${inv.invoice_no} is paid, so can you check it actually arrived and then mark it paid`;
  } else if (label === 'lost_invoice') {
    Object.assign(f, { status: 'unpaid', next_action: addDays(today, 3) });
    note = `They couldn't find the invoice, so I sent the link again and I'll follow up on ${fmtDate(addDays(today, 3))} if nothing comes in`;
    sendClient = `${ai.client_reply}\n\nInvoice ${inv.invoice_no} (${money(inv.amount, inv.currency)}): ${inv.invoice_link || CFG.paymentLink}`;
  } else if (label === 'dispute') {
    Object.assign(f, { status: 'disputed', next_action: '' });
    note = `They're disputing it, ${ai.summary.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}, so I stopped everything and this one really needs you`;
    alertOwner = ai.owner_message || `${inv.client_company} is disputing ${inv.invoice_no}, they said: "${ai.summary}"`;
  } else if (label === 'out_of_office') {
    note = "Just an out-of-office auto reply, so I kept the schedule as it is";
  } else {
    Object.assign(f, { status: 'needs_you', next_action: '' });
    note = label === 'question'
      ? `They asked something, ${ai.summary.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}, and I wrote you a draft answer but didn't send it`
      : `Their reply wasn't clear, so I'm leaving it to you: ${ai.summary}`;
    alertOwner = (ai.owner_message || `${inv.client_company} replied about ${inv.invoice_no}: "${ai.summary}"`) +
      (ai.client_reply ? `\n\nHere's a draft answer if it helps (I didn't send it):\n${ai.client_reply}` : '');
  }
  f.ai_note = note;

  const activities = [{
    invoice_no: inv.invoice_no, at: nowIso, kind: 'reply', title: `Reply from ${reply.from_name}`, body: reply.text,
    ai_note: `${LABEL_TEXT[label] || label} · ${ai.reasoning}`,
  }];
  const emails = [];
  if (sendClient) {
    const to = recipient(inv.client_email, inv.client_company);
    const subject = /^re:/i.test(reply.subject) ? reply.subject : `Re: ${reply.subject}`;
    emails.push({ to, subject, body: sendClient });
    activities.push({ invoice_no: inv.invoice_no, at: nowIso, kind: 'sent', title: subject, body: sendClient, ai_note: note });
  }
  if (alertOwner) {
    const subject = `Needs you: ${LABEL_TEXT[label]} from ${inv.client_company} ${tag(inv.invoice_no)}`;
    emails.push({ to: CFG.mailbox, subject, body: `${alertOwner}\n\nThis is what they wrote:\n${reply.text}\n\nEverything's on the dashboard whenever you're ready to handle it.` });
    activities.push({ invoice_no: inv.invoice_no, at: nowIso, kind: 'alert', title: 'Flagged for you', body: alertOwner, ai_note: '' });
  }
  return { json: { fields: f, activities, emails } };
});
