/**
 * Smart Certificate Generator & Bulk Email Automation
 * Server entry point and HTTP router for React Web App
 */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Smart Certificate Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
