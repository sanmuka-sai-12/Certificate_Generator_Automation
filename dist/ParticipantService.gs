/**
 * Participant storage and status service
 */

/**
 * Saves participants in bulk chunks
 * @param {string} projectId 
 * @param {Array<Object>} list 
 * @returns {{saved: number}}
 */
function saveParticipants(projectId, list) {
  if (!list || list.length === 0) return { saved: 0 };
  const { ss } = openProject_(projectId);
  const sh = ss.getSheetByName('Participants');

  const rows = list.map(p => {
    const row = P_COLS.map(col => (p[col] !== undefined && p[col] !== null ? p[col] : ''));
    row[COL.gen_status] = row[COL.gen_status] || 'Pending';
    row[COL.email_status] = row[COL.email_status] || 'Pending';
    row[COL.attempts] = row[COL.attempts] || 0;
    row[COL.validity] = row[COL.validity] || 'valid';
    return row;
  });

  const startRow = sh.getLastRow() + 1;
  sh.getRange(startRow, 1, rows.length, P_COLS.length).setValues(rows);

  audit_(ss, 'participants_imported', 'count=' + rows.length);
  return { saved: rows.length };
}

/**
 * Retrieves all participants for a given project
 * @param {string} projectId 
 * @returns {Array<Object>}
 */
function getParticipants(projectId) {
  const { ss } = openProject_(projectId);
  const sh = ss.getSheetByName('Participants');
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];

  values.shift(); // Remove header row
  return values.map((row, index) => {
    const item = { rowNum: index + 2 };
    P_COLS.forEach((col, j) => {
      item[col] = row[j] instanceof Date ? row[j].toISOString() : row[j];
    });
    return item;
  });
}

/**
 * Updates several columns in a single row efficiently
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sh 
 * @param {number} rowNum 
 * @param {Object} obj 
 */
function writeRow_(sh, rowNum, obj) {
  const rng = sh.getRange(rowNum, 1, 1, P_COLS.length);
  const values = rng.getValues()[0];
  Object.keys(obj).forEach(key => {
    if (COL[key] !== undefined) {
      values[COL[key]] = obj[key];
    }
  });
  rng.setValues([values]);
}

/**
 * Computes high-level participant stats for a project
 * @param {string} projectId 
 * @returns {Object}
 */
function getParticipantStats(projectId) {
  const { ss } = openProject_(projectId);
  const sh = ss.getSheetByName('Participants');
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) {
    return { total: 0, generated: 0, sent: 0, pending: 0, failed: 0 };
  }

  values.shift();
  let generated = 0, sent = 0, pending = 0, failed = 0;
  values.forEach(r => {
    if (r[COL.gen_status] === 'Generated') generated++;
    const es = r[COL.email_status];
    if (es === 'Sent') sent++;
    else if (es === 'Pending' || es === 'Retry') pending++;
    else if (es === 'Failed') failed++;
  });

  return {
    total: values.length,
    generated: generated,
    sent: sent,
    pending: pending,
    failed: failed
  };
}
