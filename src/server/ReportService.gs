/**
 * Report Service: Generates exportable logs and participant delivery summaries
 */

/**
 * Returns structured reporting data for CSV/XLSX export
 * @param {string} projectId 
 * @returns {Array<Object>}
 */
function getReportData(projectId) {
  const { ss } = openProject_(projectId);
  const v = ss.getSheetByName('Participants').getDataRange().getValues();
  if (v.length <= 1) return [];

  v.shift(); // remove header
  return v.map(r => ({
    name: r[COL.name],
    email: r[COL.email],
    cert_id: r[COL.cert_id],
    cert_type: r[COL.cert_type],
    college: r[COL.college],
    validity: r[COL.validity],
    gen_status: r[COL.gen_status],
    email_status: r[COL.email_status],
    attempts: r[COL.attempts],
    last_error: r[COL.last_error],
    sent_at: r[COL.sent_at] instanceof Date ? r[COL.sent_at].toISOString() : r[COL.sent_at]
  }));
}
