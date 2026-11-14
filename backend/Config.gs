/**
 * System configuration and column mappings
 */

const CFG = {
  ROOT_FOLDER: 'CertGen',
  REGISTRY_NAME: 'CertGen Registry',
  MAX_RUN_MS: 5 * 60 * 1000,    // 5 minutes max run loop before Apps Script 6-min limit
  SEND_DELAY_MS: 1500,          // pause between sending individual emails
  MAX_ATTEMPTS: 3,              // max retry attempts for transient errors
  DEFAULT_BATCH_SIZE: 50,       // default batch size
  PAGE_WIDTH: 3508,             // A4 landscape 300 DPI width
  PAGE_HEIGHT: 2480             // A4 landscape 300 DPI height
};

/**
 * Column order of the Participants sheet (single source of truth)
 */
const P_COLS = [
  'name',
  'email',
  'cert_type',
  'college',
  'department',
  'reg_no',
  'position',
  'custom_json',
  'cert_id',
  'verify_token',
  'validity',
  'pdf_file_id',
  'gen_status',
  'email_status',
  'attempts',
  'last_error',
  'sent_at'
];

/**
 * Fast column index lookup dictionary
 */
const COL = {};
P_COLS.forEach((colName, index) => {
  COL[colName] = index;
});
