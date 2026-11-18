// Demo email history that matches the demo invoices and their activity.
// Emails from us are written in the owner's voice; the clients' replies are in their own words.
const t = (n, hh = '09:00') => `${addDays(today, n)}T${hh}:00.000Z`;
const us = `${CFG.business} Billing`;
const sig = `\n\nThanks,\n${CFG.ownerName}`;
const link = (inv) => `${CFG.paymentLink}/${inv}`;
const m = (at, direction, invoice_no, from_name, to_addr, subject, body) => ({ json: { at, direction, invoice_no, from_name, to_addr, subject, body } });
const promiseDay = addDays(today, 3);

return [
  m(t(-18), 'out', 'INV-1041', us, 'ap@acmedentalgroup.com', 'Invoice INV-1041 is due today [INV-1041]',
    `Hey Rachel,\n\nhope you're doing well, I just wanted to give you a quick heads up that invoice INV-1041 for $2,400 is due today, so here's the link if you need it: ${link('INV-1041')}\n\nCould you let me know when you're expecting to send it over?${sig}`),
  m(t(-6), 'out', 'INV-1041', us, 'ap@acmedentalgroup.com', 'Following up on INV-1041 [INV-1041]',
    `Hey Rachel,\n\nsorry to chase you on this, I know things get busy, but invoice INV-1041 for $2,400 was due on ${fmtDate(addDays(today, -18))} and it's about 12 days late now, so I just wanted to make sure it didn't get buried somewhere. Here's the link again: ${link('INV-1041')}\n\nCould you tell me roughly when you think you'll pay it? And if anything's holding it up honestly just tell me and we'll sort it out together.${sig}`),

  m(t(-8), 'out', 'INV-1040', us, 'chris@lumenrealty.com', 'Quick reminder about INV-1040 [INV-1040]',
    `Hey Chris,\n\nhope all's good on your side, I'm just following up on invoice INV-1040 for $3,600 which was due on ${fmtDate(addDays(today, -10))} and might have slipped through, so here's the link in case you need it: ${link('INV-1040')}\n\nWhen do you think you'll be able to pay it?${sig}`),
  m(t(-1, '14:12'), 'in', 'INV-1040', 'Chris Patel', CFG.mailbox, 'Re: Quick reminder about INV-1040 [INV-1040]',
    `Hi Sam, sorry for the delay, our finance team runs payments on ${weekday(promiseDay)}. You'll have it then.`),
  m(t(-1, '14:13'), 'out', 'INV-1040', us, 'chris@lumenrealty.com', 'Re: Quick reminder about INV-1040 [INV-1040]',
    `Hey Chris,\n\nno worries at all and thanks for letting me know, ${weekday(promiseDay)} ${fmtDate(promiseDay)} totally works, so I'll keep an eye out for it then.${sig}`),

  m(t(-40), 'out', 'INV-1035', us, 'accounts@orbitlogistics.com', 'Reminder about INV-1035 [INV-1035]',
    `Hey Leo,\n\nhope you're doing well, I wanted to follow up on invoice INV-1035 for $7,800 because it's overdue now, so here's the link: ${link('INV-1035')}\n\nCould you let me know when you're planning to pay it? And if there's anything on your side we need to talk about just tell me.${sig}`),
  m(t(-5, '10:41'), 'in', 'INV-1035', 'Leo Rivera', CFG.mailbox, 'Re: Reminder about INV-1035 [INV-1035]',
    "We're not paying the full amount until phase 2 is delivered as agreed in the SOW. The tracking dashboard still isn't live."),
  m(t(-5, '10:42'), 'owner', 'INV-1035', us, CFG.mailbox, 'Needs you: Dispute from Orbit Logistics [INV-1035]',
    "Orbit Logistics is disputing INV-1035 ($7,800), Leo says they won't pay the full amount until the phase 2 tracking dashboard is live, so I stopped all the reminders and honestly this one is better coming from you directly.\n\nEverything's on the dashboard whenever you're ready to handle it."),

  m(t(-6), 'out', 'INV-1037', us, 'omar@pinecrestclinic.com', 'Invoice INV-1037 is a few days late [INV-1037]',
    `Hey Omar,\n\nhope you're doing well, I'm just following up on invoice INV-1037 for $1,900 because it's a few days past due and it might have slipped through, so here's the link: ${link('INV-1037')}\n\nWhen do you think you'll be able to send it?${sig}`),
  m(t(-1, '16:05'), 'in', 'INV-1037', 'Omar Said', CFG.mailbox, 'Re: Invoice INV-1037 is a few days late [INV-1037]',
    'Paid this via bank transfer yesterday, should land today or tomorrow.'),
  m(t(-1, '16:06'), 'out', 'INV-1037', us, 'omar@pinecrestclinic.com', 'Re: Invoice INV-1037 is a few days late [INV-1037]',
    `Hey Omar,\n\nthank you so much, I really appreciate it, I'll keep an eye out and confirm once it shows up on our side.${sig}`),
];
