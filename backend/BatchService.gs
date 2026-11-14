/**
 * Batch Email Engine: LockService, idempotent processing, triggers, and resume logic
 */

/**
 * Executes a controlled batch of email sends
 * @param {string} projectId 
 * @returns {Object}
 */
function sendBatch(projectId) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(10000)) {
    return { ok: false, error: 'Another send run is currently active.' };
  }

  const t0 = Date.now();
  try {
    const { ss, row } = openProject_(projectId);
    const sh = ss.getSheetByName('Participants');

    // Mark any rows left stuck in 'Processing' from an unexpected crash as 'Uncertain'
    markStuckAsUncertain_(sh);

    let ctl = readControl_(ss);
    if (ctl.run_state !== 'running') {
      return { ok: true, state: ctl.run_state };
    }

    const tpl = readEmailTemplate_(ss);
    const ctx = {
      event: row[3],
      org: row[2],
      verifyBase: verifyBase_()
    };

    const limit = Math.min(
      Number(ctl.batch_size) || CFG.DEFAULT_BATCH_SIZE,
      MailApp.getRemainingDailyQuota()
    );

    const data = sh.getDataRange().getValues();
    let sent = 0;

    for (let r = 1; r < data.length && sent < limit; r++) {
      // Time guard to exit before Apps Script 6-minute hard limit
      if (Date.now() - t0 > CFG.MAX_RUN_MS) break;

      // Honor pause/stop immediately
      if (readControl_(ss).run_state !== 'running') break;

      const v = data[r];
      const st = v[COL.email_status];
      if (st !== 'Pending' && st !== 'Retry') continue;
      if (v[COL.validity] !== 'valid' || !v[COL.pdf_file_id]) continue;

      const currentAttempts = Number(v[COL.attempts]) || 0;

      // STEP 1: Write 'Processing' BEFORE sending to guarantee idempotency
      writeRow_(sh, r + 1, {
        email_status: 'Processing',
        attempts: currentAttempts + 1
      });

      try {
        const m = buildEmail_(tpl, {
          name: v[COL.name],
          cert_id: v[COL.cert_id],
          token: v[COL.verify_token]
        }, ctx);

        MailApp.sendEmail({
          to: v[COL.email],
          subject: m.subject,
          body: m.text,
          htmlBody: m.html,
          name: ctx.org || 'Certificate Generator',
          attachments: [DriveApp.getFileById(v[COL.pdf_file_id]).getBlob()]
        });

        // STEP 2: Write 'Sent' immediately after success
        writeRow_(sh, r + 1, {
          email_status: 'Sent',
          sent_at: new Date(),
          last_error: ''
        });

        log_(ss, r + 1, v[COL.email], 'Sent', '');
        sent++;
      } catch (err) {
        const msg = String(err.message || err);
        const permanent = /invalid|not a valid|no recipient/i.test(msg);
        const quota = /quota|limit exceeded|too many/i.test(msg);
        const tries = currentAttempts + 1;

        writeRow_(sh, r + 1, {
          email_status: (permanent || tries >= CFG.MAX_ATTEMPTS) ? 'Failed' : 'Retry',
          last_error: msg.slice(0, 200)
        });

        log_(ss, r + 1, v[COL.email], 'Failed', msg);

        if (quota) break; // Daily quota exhausted, stop loop and schedule next trigger
      }

      Utilities.sleep(CFG.SEND_DELAY_MS);
    }

    return afterRun_(projectId, ss, sh);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Checks for participants left in 'Processing' and marks them 'Uncertain'
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sh 
 */
function markStuckAsUncertain_(sh) {
  const v = sh.getDataRange().getValues();
  for (let r = 1; r < v.length; r++) {
    if (v[r][COL.email_status] === 'Processing') {
      writeRow_(sh, r + 1, { email_status: 'Uncertain' });
    }
  }
}

/**
 * Reads key-value pairs from project Control sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 * @returns {Object}
 */
function readControl_(ss) {
  const v = ss.getSheetByName('Control').getDataRange().getValues();
  const o = {};
  v.forEach(r => { o[r[0]] = r[1]; });
  return o;
}

/**
 * Sets a key-value pair in project Control sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 * @param {string} key 
 * @param {*} val 
 */
function setControl_(ss, key, val) {
  const sh = ss.getSheetByName('Control');
  const v = sh.getDataRange().getValues();
  const i = v.findIndex(r => r[0] === key);
  if (i >= 0) {
    sh.getRange(i + 1, 2).setValue(val);
  } else {
    sh.appendRow([key, val]);
  }
}

/**
 * Logs an email event in the project's EmailLog sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 * @param {number} rowNum 
 * @param {string} email 
 * @param {string} status 
 * @param {string} err 
 */
function log_(ss, rowNum, email, status, err) {
  ss.getSheetByName('EmailLog').appendRow([
    new Date(),
    rowNum,
    email,
    status,
    err || ''
  ]);
}

/**
 * Starts a bulk sending run
 * @param {string} projectId 
 * @param {number} batchSize 
 * @returns {Object}
 */
function startSending(projectId, batchSize) {
  const { ss } = openProject_(projectId);
  setControl_(ss, 'run_state', 'running');
  setControl_(ss, 'batch_size', batchSize || CFG.DEFAULT_BATCH_SIZE);
  PropertiesService.getUserProperties().setProperty('ACTIVE_PROJECT', projectId);
  audit_(ss, 'send_started', 'batch=' + (batchSize || CFG.DEFAULT_BATCH_SIZE));
  return sendBatch(projectId);
}

/**
 * Evaluates pending work and creates time-driven trigger if needed
 * @param {string} projectId 
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sh 
 * @returns {Object}
 */
function afterRun_(projectId, ss, sh) {
  const v = sh.getDataRange().getValues();
  const left = v.filter((r, i) =>
    i > 0 &&
    (r[COL.email_status] === 'Pending' || r[COL.email_status] === 'Retry') &&
    r[COL.validity] === 'valid'
  ).length;

  clearRunTriggers_();

  if (left === 0) {
    setControl_(ss, 'run_state', 'finished');
    audit_(ss, 'send_finished', 'all processed');
    return { ok: true, finished: true, remaining: 0 };
  }

  const quota = MailApp.getRemainingDailyQuota();
  const builder = ScriptApp.newTrigger('triggerRun').timeBased();

  if (quota <= 0) {
    // Wait for quota renewal (runs every hour to check)
    builder.everyHours(1).create();
    setControl_(ss, 'run_state', 'quota_paused');
  } else {
    // Quota remains, continue shortly after cooldown
    builder.after(60 * 1000).create();
  }

  return { ok: true, remaining: left, quotaRemaining: quota };
}

/**
 * Trigger handler for automated background batch continuation
 */
function triggerRun() {
  const id = PropertiesService.getUserProperties().getProperty('ACTIVE_PROJECT');
  if (id && MailApp.getRemainingDailyQuota() > 0) {
    sendBatch(id);
  }
}

/**
 * Clears any active 'triggerRun' triggers
 */
function clearRunTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'triggerRun')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

/**
 * Pauses sending run
 * @param {string} pid 
 */
function pauseSending(pid) {
  const { ss } = openProject_(pid);
  setControl_(ss, 'run_state', 'paused');
  clearRunTriggers_();
  audit_(ss, 'send_paused', '');
  return { ok: true };
}

/**
 * Resumes sending run
 * @param {string} pid 
 */
function resumeSending(pid) {
  const { ss } = openProject_(pid);
  setControl_(ss, 'run_state', 'running');
  PropertiesService.getUserProperties().setProperty('ACTIVE_PROJECT', pid);
  audit_(ss, 'send_resumed', '');
  return sendBatch(pid);
}

/**
 * Stops sending run and clears triggers
 * @param {string} pid 
 */
function stopSending(pid) {
  const { ss } = openProject_(pid);
  setControl_(ss, 'run_state', 'stopped');
  clearRunTriggers_();
  audit_(ss, 'send_stopped', '');
  return { ok: true };
}

/**
 * Fetches real-time status and counts for monitoring dashboard
 * @param {string} projectId 
 * @returns {Object}
 */
function getProgress(projectId) {
  const { ss } = openProject_(projectId);
  const v = ss.getSheetByName('Participants').getDataRange().getValues();
  const counts = {
    Pending: 0,
    Processing: 0,
    Sent: 0,
    Failed: 0,
    Retry: 0,
    Uncertain: 0,
    Skipped: 0
  };

  for (let i = 1; i < v.length; i++) {
    const s = v[i][COL.email_status];
    if (s in counts) counts[s]++;
  }

  const ctl = readControl_(ss);
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'triggerRun').length;

  return {
    counts: counts,
    total: Math.max(0, v.length - 1),
    state: ctl.run_state || 'idle',
    quota: MailApp.getRemainingDailyQuota(),
    nextRunScheduled: triggers > 0
  };
}
