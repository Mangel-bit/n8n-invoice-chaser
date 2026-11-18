// A short believable history for the demo invoices. Matches the demo emails in setup-seed-mailbox.js.
const at = (n, hh = '09:00') => `${addDays(today, n)}T${hh}:00.000Z`;
const a = (invoice_no, when, kind, title, body, ai_note = '') => ({ json: { invoice_no, at: when, kind, title, body, ai_note } });
const promiseDay = addDays(today, 3);
return [
  a('INV-1041', at(-18), 'sent', 'Invoice INV-1041 is due today', 'Friendly reminder on the due date.', 'Written by Claude · friendly tone'),
  a('INV-1041', at(-6), 'sent', 'Following up on INV-1041', 'Second reminder, asked for a payment date.', 'Written by Claude · clear tone'),
  a('INV-1040', at(-8), 'sent', 'Quick reminder about INV-1040', 'First overdue reminder.', 'Written by Claude · friendly tone'),
  a('INV-1040', at(-1, '14:12'), 'reply', 'Reply from Chris Patel', `Hi Sam, sorry for the delay, our finance team runs payments on ${weekday(promiseDay)}. You'll have it then.`,
    `Promise to pay · He says their finance team pays on ${weekday(promiseDay)}s, so I took that as a promise for this ${weekday(promiseDay)}, ${fmtDate(promiseDay)}`),
  a('INV-1040', at(-1, '14:13'), 'sent', 'Re: Quick reminder about INV-1040', 'Thanked him and confirmed the date.',
    `They promised to pay on ${weekday(promiseDay)} ${fmtDate(promiseDay)}, so I paused the reminders and I'll only check back on ${fmtDate(addDays(promiseDay, 1))} if it doesn't come in`),
  a('INV-1035', at(-40), 'sent', 'Reminder about INV-1035', 'Overdue reminder.', 'Written by Claude · clear tone'),
  a('INV-1035', at(-5, '10:41'), 'reply', 'Reply from Leo Rivera', "We're not paying the full amount until phase 2 is delivered as agreed in the SOW. The tracking dashboard still isn't live.",
    "Dispute · He's refusing to pay in full until the tracking dashboard from phase 2 is live, so this is a dispute about the work and not something I should reply to"),
  a('INV-1035', at(-5, '10:42'), 'alert', 'Flagged for you', 'Orbit Logistics is disputing INV-1035 over the phase 2 dashboard, so I stopped all reminders.', ''),
  a('INV-1037', at(-6), 'sent', 'Invoice INV-1037 is a few days late', 'Overdue reminder.', 'Written by Claude · friendly tone'),
  a('INV-1037', at(-1, '16:05'), 'reply', 'Reply from Omar Said', 'Paid this via bank transfer yesterday, should land today or tomorrow.',
    "Says it is paid · He says the bank transfer went out yesterday, so I stopped the reminders but you should check it actually landed before marking it paid"),
  a('INV-1038', at(-2), 'paid', 'Marked as paid', 'You confirmed the payment came in.', ''),
];
