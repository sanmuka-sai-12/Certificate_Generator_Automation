/**
 * Smart Certificate Generator & Bulk Email Automation
 * Server entry point and HTTP router
 */

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('index');
  return t.evaluate()
    .setTitle('Smart Certificate Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper to include HTML/CSS/JS partials into templates
 * @param {string} filename - name of the HTML file in Apps Script (e.g., 'css_app', 'js_api')
 * @returns {string} HTML content
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns current authenticated user information
 * @returns {{email: string}}
 */
function whoAmI() {
  return {
    email: Session.getActiveUser().getEmail()
  };
}
