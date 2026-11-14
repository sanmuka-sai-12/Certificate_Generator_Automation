/**
 * User Registry & First-Run Bootstrap
 */

/**
 * Ensures the user's CertGen root folder and Registry spreadsheet exist
 * @returns {{registryId: string, user: string}}
 */
function bootstrap() {
  const up = PropertiesService.getUserProperties();
  let id = up.getProperty('REGISTRY_ID');
  if (id) {
    try {
      SpreadsheetApp.openById(id);
      return info_(id);
    } catch (e) {
      console.warn('Existing registry could not be opened, creating a new one.');
    }
  }

  const root = getOrCreateFolder_(CFG.ROOT_FOLDER);
  const ss = SpreadsheetApp.create(CFG.REGISTRY_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(root);

  const defs = {
    Projects: [
      'project_id', 'name', 'organization', 'event_name', 'event_date',
      'cert_type', 'template_id', 'sheet_id', 'folder_id', 'sender_email',
      'status', 'created_at'
    ],
    Templates: [
      'template_id', 'name', 'type', 'json_file_id', 'thumb_file_id', 'created_at'
    ],
    EmailTemplates: [
      'et_id', 'name', 'subject', 'body', 'created_at'
    ],
    Settings: [
      'key', 'value'
    ]
  };

  const sheetNames = Object.keys(defs);
  sheetNames.forEach((sheetName, index) => {
    const sh = index === 0 ? ss.getSheets()[0].setName(sheetName) : ss.insertSheet(sheetName);
    const headers = defs[sheetName];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });

  // Seed default settings
  const settingsSheet = ss.getSheetByName('Settings');
  settingsSheet.getRange(2, 1, 4, 2).setValues([
    ['default_size', 'A4_LANDSCAPE'],
    ['pdf_quality', '0.92'],
    ['batch_size', '50'],
    ['send_delay_ms', '1500']
  ]);

  up.setProperty('REGISTRY_ID', ss.getId());
  return info_(ss.getId());
}

/**
 * Returns metadata about the user's registry
 * @param {string} id 
 * @returns {{registryId: string, user: string}}
 */
function info_(id) {
  return {
    registryId: id,
    user: Session.getActiveUser().getEmail()
  };
}

/**
 * Opens and returns the user's private Registry spreadsheet
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function registry_() {
  const up = PropertiesService.getUserProperties();
  let id = up.getProperty('REGISTRY_ID');
  if (!id) {
    const res = bootstrap();
    id = res.registryId;
  }
  return SpreadsheetApp.openById(id);
}
