/**
 * Email Service: Sender identity, email templates, and test email sending
 */

/**
 * Returns sender information and remaining daily quota
 * @returns {{email: string, quota: number, kind: string}}
 */
function senderInfo() {
  const email = Session.getActiveUser().getEmail();
  const domain = (email.split('@')[1] || '').toLowerCase();
  const isConsumer = /gmail\.com|googlemail\.com/.test(domain);
  return {
    email: email,
    quota: MailApp.getRemainingDailyQuota(),
    kind: isConsumer ? 'Personal Gmail (~100/day)' : 'Workspace (~1,500/day)'
  };
}

/**
 * Reads the email template configuration from project Control or Registry
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 * @returns {{subject: string, body: string}}
 */
function readEmailTemplate_(ss) {
  const ctl = readControl_(ss);
  return {
    subject: ctl.subject || 'Your Certificate for {{EVENT_NAME}}',
    body: ctl.body || 'Dear {{STUDENT_NAME}},\n\nCongratulations! Please find your certificate attached.\n\nBest regards,\n{{ORG_NAME}}'
  };
}

/**
 * Saves the project's email template into the Control sheet
 * @param {string} projectId 
 * @param {{subject: string, body: string}} tpl 
 * @returns {{ok: boolean}}
 */
function saveEmailTemplate(projectId, tpl) {
  const { ss } = openProject_(projectId);
  setControl_(ss, 'subject', tpl.subject || '');
  setControl_(ss, 'body', tpl.body || '');
  return { ok: true };
}

/**
 * Renders subject, plain-text body, and HTML body with escaped variables
 * @param {{subject: string, body: string}} tpl 
 * @param {Object} p 
 * @param {Object} ctx 
 * @returns {{subject: string, text: string, html: string}}
 */
function buildEmail_(tpl, p, ctx) {
  const vars = {
    STUDENT_NAME: p.name || '',
    EVENT_NAME: ctx.event || '',
    ORG_NAME: ctx.org || '',
    CERTIFICATE_ID: p.cert_id || '',
    VERIFY_URL: (ctx.verifyBase ? ctx.verifyBase + '?id=' + p.cert_id + '&t=' + (p.token || '') : '')
  };

  const subject = render_(tpl.subject, vars, false);
  const text = render_(tpl.body, vars, false);
  const html = render_(tpl.body, vars, true).replace(/\n/g, '<br>');

  return { subject, text, html };
}

/**
 * Sends a single test email with real PDF attachment to current user without changing participant state
 * @param {string} projectId 
 * @param {number} rowNum 
 * @returns {{ok: boolean}}
 */
function sendTest(projectId, rowNum) {
  const { ss, row } = openProject_(projectId);
  const participants = getParticipants(projectId);
  const p = participants.find(x => x.rowNum === rowNum) || participants[0];
  if (!p) throw new Error('No participant found for test send');
  if (!p.pdf_file_id) throw new Error('Selected participant does not have a generated PDF yet');

  const tpl = readEmailTemplate_(ss);
  const m = buildEmail_(tpl, {
    name: p.name,
    cert_id: p.cert_id,
    token: p.verify_token
  }, {
    event: row[3],
    org: row[2],
    verifyBase: verifyBase_()
  });

  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: '[TEST] ' + m.subject,
    body: m.text,
    htmlBody: m.html,
    name: row[2] || 'Smart Certificate Generator',
    attachments: [DriveApp.getFileById(p.pdf_file_id).getBlob()]
  });

  return { ok: true };
}
