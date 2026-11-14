/**
 * Shared utility functions
 */

/**
 * Gets an existing folder by name or creates it if not found
 * @param {string} name 
 * @param {GoogleAppsScript.Drive.Folder} [parent] 
 * @returns {GoogleAppsScript.Drive.Folder}
 */
function getOrCreateFolder_(name, parent) {
  const base = parent || DriveApp.getRootFolder();
  const it = base.getFoldersByName(name);
  return it.hasNext() ? it.next() : base.createFolder(name);
}

/**
 * Escapes unsafe HTML characters to prevent XSS
 * @param {string|number} s 
 * @returns {string}
 */
function escapeHtml_(s) {
  return String(s || '').replace(/[&<>"']/g, function(c) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c];
  });
}

/**
 * Replaces {{VARIABLE}} placeholders in string
 * @param {string} text 
 * @param {Object} vars 
 * @param {boolean} asHtml 
 * @returns {string}
 */
function render_(text, vars, asHtml) {
  return String(text || '').replace(/\{\{([A-Za-z0-9_:]+)\}\}/g, function(match, key) {
    const v = vars[key] !== undefined && vars[key] !== null ? vars[key] : '';
    return asHtml ? escapeHtml_(v) : v;
  });
}

/**
 * Sanitizes a string for safe filesystem naming (ASCII only)
 * @param {string} n 
 * @returns {string}
 */
function safeName_(n) {
  return String(n || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40) || 'cert';
}

/**
 * Returns the public verification web app base URL from settings
 * @returns {string}
 */
function verifyBase_() {
  const up = PropertiesService.getUserProperties();
  return up.getProperty('VERIFIER_URL') || '';
}
