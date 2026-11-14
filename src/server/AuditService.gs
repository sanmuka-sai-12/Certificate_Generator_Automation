/**
 * Audit logging service
 */

/**
 * Appends an entry to the project's Audit sheet
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 * @param {string} action 
 * @param {string} details 
 */
function audit_(ss, action, details) {
  try {
    const sh = ss.getSheetByName('Audit');
    if (sh) {
      sh.appendRow([
        new Date(),
        Session.getActiveUser().getEmail(),
        action,
        details || ''
      ]);
    }
  } catch (err) {
    console.error('Failed to write audit entry:', err);
  }
}
