// Adds demo invoices only when the Invoices table is empty. Dates are relative to today.
const existing = $input.all().map((i) => i.json).filter((r) => r.invoice_no);
if (existing.length) return [];

const d = (n) => addDays(today, n);
const base = { currency: CFG.currency, reminders_sent: 0, promised_date: '', paid_date: '', last_update: today };
const rows = [
  { invoice_no: 'INV-1041', client_company: 'Acme Dental Group', client_name: 'Rachel Kim', client_email: 'ap@acmedentalgroup.com',
    amount: 2400, issue_date: d(-48), due_date: d(-18), status: 'unpaid', reminders_sent: 2, next_action: today, ai_note: 'Sent two reminders and no reply yet, so the next one goes out firmer but still friendly' },
  { invoice_no: 'INV-1042', client_company: 'Brightline Fitness', client_name: 'Marcus Lee', client_email: 'marcus@brightlinefit.com',
    amount: 850, issue_date: d(-33), due_date: d(-3), status: 'unpaid', reminders_sent: 0, next_action: today, ai_note: 'It just went overdue, so the first friendly reminder goes out on the next run' },
  { invoice_no: 'INV-1043', client_company: 'Harbor Legal LLP', client_name: 'Dana Ortiz', client_email: 'billing@harborlegal.com',
    amount: 5200, issue_date: d(-28), due_date: d(2), status: 'unpaid', reminders_sent: 0, next_action: today, ai_note: "Due in 2 days, so I'll send a light heads-up before it's late" },
  { invoice_no: 'INV-1040', client_company: 'Lumen Realty', client_name: 'Chris Patel', client_email: 'chris@lumenrealty.com',
    amount: 3600, issue_date: d(-40), due_date: d(-10), status: 'promised', promised_date: d(3), reminders_sent: 1, next_action: d(4),
    ai_note: `They promised to pay on ${weekday(d(3))}, so I paused the reminders and I'll only check back if it doesn't come in` },
  { invoice_no: 'INV-1035', client_company: 'Orbit Logistics', client_name: 'Leo Rivera', client_email: 'accounts@orbitlogistics.com',
    amount: 7800, issue_date: d(-94), due_date: d(-64), status: 'disputed', reminders_sent: 3, next_action: '',
    ai_note: "They're saying phase 2 wasn't delivered the way it was agreed, so I stopped everything and this one really needs you" },
  { invoice_no: 'INV-1038', client_company: 'Kova Coffee Co.', client_name: 'Nina Haddad', client_email: 'nina@kovacoffee.com',
    amount: 1150, issue_date: d(-36), due_date: d(-6), status: 'paid', paid_date: d(-2), reminders_sent: 1, next_action: '', ai_note: 'Paid after one reminder, all done' },
  { invoice_no: 'INV-1037', client_company: 'Pinecrest Clinic', client_name: 'Omar Said', client_email: 'omar@pinecrestclinic.com',
    amount: 1900, issue_date: d(-45), due_date: d(-15), status: 'check_payment', reminders_sent: 2, next_action: '',
    ai_note: 'They say they paid yesterday, so I stopped the reminders, just check your bank before you mark it paid' },
].map((r) => ({ ...base, ...r, invoice_link: `${CFG.paymentLink}/${r.invoice_no}` }));

return rows.map((json) => ({ json }));
