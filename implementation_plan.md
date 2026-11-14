Smart Certificate Generator
and Bulk Email Automation
Complete technical implementation guide: from an empty folder to a deployed, working
product
This guide explains every step in the order you should do it. For each step you get: what to do, why it is needed, the
exact code or configuration, and how to check that it works before moving on. It is written so that a developer, or an
AI coding agent such as Antigravity, can follow it without guessing.
What is inside
Part Topic Steps
A Understand the system, decisions and limits -
B Tools, accounts and project setup 1 - 4
C Backend foundation (Sheets, Drive, projects) 5 - 8
D Frontend shell 9 - 10
E Certificate designer and template library 11 - 14
F Participant import, validation, mapping 15 - 17
G Preview and PDF generation 18 - 20
H Gmail sender, email template, test send 21 - 23
I Bulk email engine (batches, triggers, resume) 24 - 27
J Tracking, reports, verification and QR 28 - 30
K Security, testing, deployment, operations 31 - 34
L Build schedule, Antigravity workflow, final checklist -
How to work: Do one step at a time. Never move to the next step until the check at the end of the current step passes.
Commit to Git after every working step.
Smart Certificate Generator - Technical Implementation Guide Page 2
Part A - Understand the system first
A1. What you are building
A web application that lets an organizer create an event, design or upload a certificate, import participants from
Excel or CSV, generate one personalized PDF per participant, and email each PDF from a Gmail account the
organizer chooses, in controlled batches that respect Gmail's daily limits. Each certificate carries a QR code that
opens a public verification page.
Component Technology Job
Web interface HTML, CSS, JavaScript served by Apps Script
HtmlService
Everything the user sees
Designer Fabric.js Drag and drop certificate editor; template stored as
JSON
Import SheetJS (xlsx) and PapaParse (csv) Read participant files in the browser
PDF engine pdf-lib in the browser Create one PDF per participant
QR codes qrcode-generator library Verification QR inside each certificate
Backend Google Apps Script (V8) Projects, storage, email sending, scheduling
Database Google Sheets Participants, status, logs
File storage Google Drive Templates, images, generated PDFs
Email MailApp (Apps Script) Sends each PDF as an attachment
Verification site Second Apps Script web app Public page that confirms a certificate
A2. Key design decisions and the reason for each
Decision Reason
Deploy the web app as 'Execute as: User
accessing the web app'
The email is sent from whichever Google account is signed in. This is how the
sender can be chosen each time without ever handling passwords. Each user's
data stays in their own Drive.
Generate PDFs in the browser, not on the
server
Apps Script has a time limit per run (about 6 minutes) and Drive conversion
quotas. The browser has neither problem and can use the exact same canvas
that the user previewed.
Template stored as JSON A saved template can be reopened and edited. A flat image cannot.
Use MailApp.sendEmail for sending It needs only the narrow script.send_mail permission, supports attachments,
and exposes the remaining daily quota.
Save status to the sheet before AND after each
email
If anything crashes mid-send, the sheet shows exactly which row was in
progress, so no one is emailed twice.
Time-driven triggers for resuming Sending must continue after the browser closes and across days when the
quota is reached.
Separate public app for verification The main app requires sign-in. Verification must be open to anyone who scans
a QR code.
A3. Limits you must design around
Limit Typical value (re-check Google's
current docs)
How the design handles it
Recipients per day, personal Gmail about 100 Quota check, automatic pause, resume next
day
Recipients per day, Workspace about 1,500 Same logic, finishes sooner
Single script run about 6 minutes Stop the loop at 5 minutes; a trigger continues
Email size 25 MB total Keep each PDF under about 1 MB
Smart Certificate Generator - Technical Implementation Guide Page 3
Limit Typical value (re-check Google's
current docs)
How the design handles it
google.script.run call payload keep under a few MB Upload one PDF per call
Drive storage (personal) 15 GB shared Show storage use; JPEG at quality 0.9
Honest note: Everything except email volume can be free and effectively unlimited. Email volume is capped by Google.
1,000 certificates on a personal Gmail takes about 10 days; on Workspace, one day. Optional fallback: let participants
download their own certificate from the verification site.
Smart Certificate Generator - Technical Implementation Guide Page 4
Part B - Tools, accounts and project setup
Step 1 - Prepare accounts and tools
Why this step exists: You need a place to write code, a way to push it to Google, and test accounts to prove the
sender choice works.
- Create or choose two Google accounts for testing (Account A and Account B). Using two is the only way to
prove the 'choose any Gmail' feature.
- Install Node.js (LTS), Git, and your editor (Antigravity or VS Code).
- Install clasp, Google's command line tool for Apps Script: npm install -g @google/clasp.
- Open https://script.google.com/home/usersettings and switch Google Apps Script API to ON.
- Run clasp login and sign in with Account A.
- Create a Git repository: git init certgen and open that folder in your editor.
Check: clasp --version prints a version and clasp login reports success.
Step 2 - Create the Apps Script web app project
Why this step exists: This creates the cloud project that will host both the backend and the frontend.
Terminal
cd certgen
clasp create --type webapp --title "Smart Certificate Generator" --rootDir ./src
# This creates .clasp.json and src/appsscript.json
Keep all code inside src/. clasp uploads only that folder.
Important gotcha: clasp treats every .js file as server code. Browser JavaScript and CSS therefore must live in .html
files that contain <script> or <style> tags, and are pulled into the page by an include() function (Step 9). Server
files use the .gs extension.
Step 3 - Configure appsscript.json (permissions and deployment mode)
Why this step exists: This file decides who the script runs as and which Google permissions the user is asked to
grant.
src/appsscript.json
{
 "timeZone": "Asia/Kolkata",
 "exceptionLogging": "STACKDRIVER",
 "runtimeVersion": "V8",
 "webapp": { "executeAs": "USER_ACCESSING", "access": "ANYONE" },
 "oauthScopes": [
 "https://www.googleapis.com/auth/userinfo.email",
 "https://www.googleapis.com/auth/spreadsheets",
 "https://www.googleapis.com/auth/drive",
 "https://www.googleapis.com/auth/script.send_mail",
 "https://www.googleapis.com/auth/script.scriptapp"
 ]
}
- access: ANYONE means anyone signed in with a Google account (not anonymous).
- script.send_mail is the narrow permission for MailApp. script.scriptapp allows creating the resume
triggers.
- drive is needed because DriveApp operates on the user's own files. The narrower drive.file scope is only
possible with the Advanced Drive service; for personal or college use the drive scope is acceptable.
Step 4 - Hello world deployment and the two-account test
Why this step exists: Prove that deployment, sign-in and the identity of the user work before you write any real
feature.
Smart Certificate Generator - Technical Implementation Guide Page 5
First server file
// src/Code.gs
function doGet() {
 const t = HtmlService.createTemplateFromFile('index');
 return t.evaluate()
 .setTitle('Certificate Generator')
 .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function include(name) {
 return HtmlService.createHtmlOutputFromFile(name).getContent();
}
function whoAmI() {
 return { email: Session.getActiveUser().getEmail() };
}
First page
<!-- src/index.html -->
<!DOCTYPE html><html><body>
<h1>Hello</h1><p id="u">...</p>
<script>
 google.script.run.withSuccessHandler(r => u.textContent = r.email).whoAmI();
</script></body></html>
- Run clasp push, then clasp open and use Deploy > New deployment > Web app. Execute as: User accessing
the web app. Who has access: Anyone with Google account.
- Open the deployment URL as Account A: it should show Account A's email after the permission screen.
- Open it in a private window as Account B: it should show Account B's email.
Check: two accounts, two different emails. This is the foundation of the sender selection feature.
Prompt for Antigravity: Set up an Apps Script web app project with clasp using the structure in this guide (src folder,
appsscript.json with USER_ACCESSING). Create doGet, include and whoAmI, and a page that shows the signed-in
email. Give me the exact deploy commands.
Smart Certificate Generator - Technical Implementation Guide Page 6
Part C - Backend foundation
Step 5 - Configuration and helper functions
Why this step exists: One place for constants and shared helpers prevents bugs from magic strings spread across
files.
Config and helpers
// src/Config.gs
const CFG = {
 ROOT_FOLDER: 'CertGen',
 REGISTRY_NAME: 'CertGen Registry',
 MAX_RUN_MS: 5 * 60 * 1000, // stop sending loop before the 6 minute limit
 SEND_DELAY_MS: 1500, // pause between emails
 MAX_ATTEMPTS: 3
};
// Column order of the Participants sheet (single source of truth)
const P_COLS = ['name','email','cert_type','position','custom_json','cert_id','verify_token',
 'validity','pdf_file_id','gen_status','email_status','attempts','last_error','sent_at'];
const COL = {};
P_COLS.forEach((c, i) => COL[c] = i);
// src/Utils.gs
function getOrCreateFolder_(name, parent) {
 const base = parent || DriveApp.getRootFolder();
 const it = base.getFoldersByName(name);
 return it.hasNext() ? it.next() : base.createFolder(name);
}
function escapeHtml_(s) {
 return String(s).replace(/[&<>"']/g, c =>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function render_(text, vars, asHtml) {
 return String(text).replace(/\{\{([A-Za-z_:]+)\}\}/g, (m, k) => {
 const v = vars[k] ?? '';
 return asHtml ? escapeHtml_(v) : v;
 });
}
function audit_(ss, action, details) {
 ss.getSheetByName('Audit').appendRow([new Date(), Session.getActiveUser().getEmail(), action, details || '']);
}
Step 6 - First-run bootstrap: the user's private registry
Why this step exists: Each user needs their own list of projects. The registry spreadsheet is created automatically
on first visit.
Registry
Smart Certificate Generator - Technical Implementation Guide Page 7
// src/Registry.gs
function bootstrap() {
 const up = PropertiesService.getUserProperties();
 let id = up.getProperty('REGISTRY_ID');
 if (id) { try { SpreadsheetApp.openById(id); return info_(id); } catch (e) {} }
 const root = getOrCreateFolder_(CFG.ROOT_FOLDER);
 const ss = SpreadsheetApp.create(CFG.REGISTRY_NAME);
 DriveApp.getFileById(ss.getId()).moveTo(root);
 const defs = {
 Projects: ['project_id','name','organization','event_name','event_date','cert_type','template_id',
 'sheet_id','folder_id','sender_email','status','created_at'],
 Templates: ['template_id','name','type','json_file_id','thumb_file_id','created_at'],
 EmailTemplates: ['et_id','name','subject','body','created_at'],
 Settings: ['key','value']
 };
 Object.keys(defs).forEach((n, i) => {
 const sh = i === 0 ? ss.getSheets()[0].setName(n) : ss.insertSheet(n);
 sh.getRange(1, 1, 1, defs[n].length).setValues([defs[n]]).setFontWeight('bold');
 sh.setFrozenRows(1);
 });
 up.setProperty('REGISTRY_ID', ss.getId());
 return info_(ss.getId());
}
function info_(id) {
 return { registryId: id, user: Session.getActiveUser().getEmail() };
}
function registry_() {
 const id = PropertiesService.getUserProperties().getProperty('REGISTRY_ID');
 if (!id) throw new Error('Not initialised');
 return SpreadsheetApp.openById(id);
}
Check: after the first page load, a folder 'CertGen' and a spreadsheet 'CertGen Registry' appear in that user's Drive.
A second Google account gets its own.
Step 7 - Project service (create, list, open, duplicate, delete)
Why this step exists: Every event is a project with its own folder and its own spreadsheet, so data never mixes
between events.
Projects
// src/ProjectService.gs
function createProject(p) {
 const root = getOrCreateFolder_(CFG.ROOT_FOLDER);
 const id = Utilities.getUuid().slice(0, 8);
 const folder = root.createFolder('Project_' + id + '_' + p.name);
 folder.createFolder('certificates');
 const ss = SpreadsheetApp.create('CertGen - ' + p.name);
 DriveApp.getFileById(ss.getId()).moveTo(folder);
 const sh = ss.getSheets()[0].setName('Participants');
 sh.getRange(1, 1, 1, P_COLS.length).setValues([P_COLS]).setFontWeight('bold');
 sh.setFrozenRows(1);
 ['Mapping', 'EmailLog', 'Audit', 'Control'].forEach(n => ss.insertSheet(n));
 ss.getSheetByName('Control').getRange(1, 1, 3, 2).setValues([
 ['run_state', 'idle'], ['batch_size', 50], ['subject', '']]);
 registry_().getSheetByName('Projects').appendRow([id, p.name, p.organization, p.event_name,
 p.event_date, p.cert_type, '', ss.getId(), folder.getId(), '', 'draft', new Date()]);
 audit_(ss, 'project_created', p.name);
 return { projectId: id };
}
function listProjects() {
 const v = registry_().getSheetByName('Projects').getDataRange().getValues();
 const head = v.shift();
 return v.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] instanceof Date ? r[i].toISOString() : r[i]])));
}
function openProject_(projectId) {
 const rows = registry_().getSheetByName('Projects').getDataRange().getValues();
 const row = rows.find((r, i) => i > 0 && r[0] === projectId);
 if (!row) throw new Error('Project not found'); // ownership check: only this user's registry
 return { ss: SpreadsheetApp.openById(row[7]), folder: DriveApp.getFolderById(row[8]), row };
}
Also add updateProject, duplicateProject (copy the template reference and settings, not the participants) and
deleteProject (move folder and spreadsheet to trash, remove registry row, ask for confirmation in the UI).
Step 8 - Participant storage and status helpers
Why this step exists: Every later feature reads or writes participant rows. Doing this in bulk keeps the app fast.
Participants
Smart Certificate Generator - Technical Implementation Guide Page 8
// src/ParticipantService.gs
function saveParticipants(projectId, list) { // call in chunks of 200-500 rows
 const { ss } = openProject_(projectId);
 const sh = ss.getSheetByName('Participants');
 const rows = list.map(p => P_COLS.map(c => p[c] !== undefined ? p[c] : ''));
 rows.forEach(r => { r[COL.gen_status] = r[COL.gen_status] || 'Pending';
 r[COL.email_status] = r[COL.email_status] || 'Pending';
 r[COL.attempts] = r[COL.attempts] || 0; });
 sh.getRange(sh.getLastRow() + 1, 1, rows.length, P_COLS.length).setValues(rows);
 return { saved: rows.length };
}
function getParticipants(projectId) {
 const { ss } = openProject_(projectId);
 const v = ss.getSheetByName('Participants').getDataRange().getValues();
 v.shift();
 return v.map((r, i) => Object.assign({ rowNum: i + 2 },
 Object.fromEntries(P_COLS.map((c, j) => [c, r[j] instanceof Date ? r[j].toISOString() : r[j]]))));
}
function writeRow_(sh, rowNum, obj) { // update several columns in ONE write
 const rng = sh.getRange(rowNum, 1, 1, P_COLS.length);
 const v = rng.getValues()[0];
 Object.keys(obj).forEach(k => v[COL[k]] = obj[k]);
 rng.setValues([v]);
}
Performance rule: Never loop over single cells with getValue/setValue. Read a range once, work in memory, write a
range once. Per-cell calls are the most common cause of slow Apps Script apps.
Prompt for Antigravity: Implement Config.gs, Utils.gs, Registry.gs, ProjectService.gs and ParticipantService.gs exactly
as in Steps 5 to 8. Add the missing updateProject, duplicateProject and deleteProject. Write a small test function that
creates a project, saves 3 participants and reads them back.
Smart Certificate Generator - Technical Implementation Guide Page 9
Part D - Frontend shell
Step 9 - Page layout and the include() pattern
Why this step exists: Splitting the UI into small files keeps each feature maintainable and lets an AI agent edit one
file at a time.
index.html (each included file is an .html file containing a <script> or <style> block)
<!-- src/index.html -->
<!DOCTYPE html><html><head>
<base target="_top">
<meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display&family=Great+Vibes&family=Montserrat
&family=Poppins&family=Noto+Sans+Telugu&family=Noto+Sans+Devanagari&display=swap" rel="stylesheet">
<?!= include('css') ?>
</head><body>
<aside id="nav"></aside><main id="view"></main><div id="toast"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.1/fabric.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<?!= include('js_api') ?>
<?!= include('js_app') ?>
<?!= include('js_designer') ?>
</body></html>
Pin every library to an exact version, as shown. Never use 'latest', so an upstream change cannot break your app.
Step 10 - API wrapper, router and global error handling
Why this step exists: google.script.run uses callbacks. Wrapping it in promises lets you use async/await
everywhere.
Frontend core
<script>
// js_api.html
const api = new Proxy({}, {
 get: (_, fn) => (...args) => new Promise((resolve, reject) => {
 google.script.run
 .withSuccessHandler(resolve)
 .withFailureHandler(e => { toast(e.message || 'Server error', true); reject(e); })
 [fn](...args);
 })
});
function toast(msg, isErr) {
 const t = document.getElementById('toast');
 t.textContent = msg; t.className = isErr ? 'err show' : 'show';
 setTimeout(() => t.className = '', 4000);
}
// Hash router: #/dashboard #/project/ID/designer #/project/ID/import ...
const routes = {};
function route(path, fn) { routes[path] = fn; }
window.addEventListener('hashchange', go);
function go() {
 const seg = (location.hash || '#/dashboard').slice(2).split('/');
 (routes[seg[0]] || routes.dashboard)(seg.slice(1));
}
</script>
Then build the screens: Dashboard (stat cards computed from listProjects), New Project wizard, Template
library, Email templates, Settings. Use one function per screen that fills #view with safe DOM nodes. Always use
textContent for any value that came from a file or a user; never put raw participant data into innerHTML.
Check: you can create a project from the UI, see it on the dashboard, reload and still see it.
Prompt for Antigravity: Build index.html with the include() pattern, the api proxy, the hash router, a left navigation and
a dashboard that lists projects and has a New Project form calling createProject. Responsive, clean, no inline raw HTML
from data.
Smart Certificate Generator - Technical Implementation Guide Page 10
Part E - Certificate designer and template library
Step 11 - Canvas setup with a fixed logical size
Why this step exists: The certificate must always be created at full print resolution (A4 landscape at 300 DPI =
3508 x 2480 px) while the screen shows a zoomed-out version.
Designer core
const W = 3508, H = 2480;
const canvas = new fabric.Canvas('c', { width: W, height: H, preserveObjectStacking: true });
function fitToScreen() {
 const wrap = document.getElementById('canvasWrap');
 const z = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
 canvas.setZoom(z);
 canvas.setWidth(W * z);
 canvas.setHeight(H * z);
}
window.addEventListener('resize', fitToScreen);
fitToScreen();
Keep all coordinates in logical units (the 3508 x 2480 space). Zoom only changes how it is shown, so what the user
sees is exactly what is exported.
Step 12 - Tools: text, images, shapes, background, layers, undo/redo
Why this step exists: These are the editing features in the feature specification.
Designer tools
function addText(txt, opts = {}) {
 const t = new fabric.Textbox(txt, Object.assign({
 left: W / 2, top: 600, originX: 'center', width: 2400, textAlign: 'center',
 fontFamily: 'Playfair Display', fontSize: 120, fill: '#1a1a1a'
 }, opts));
 canvas.add(t); canvas.setActiveObject(t);
}
function addPlaceholder(key) { // key e.g. STUDENT_NAME
 addText('{{' + key + '}}', { fontSize: 160, fill: '#0b3d91',
 data: { dynamic: true, autoShrink: true, maxWidth: 2400, minSize: 60 } });
}
function setBackground(dataUrl) {
 fabric.Image.fromURL(dataUrl, img => {
 img.set({ scaleX: W / img.width, scaleY: H / img.height, selectable: false, evented: false });
 canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas));
 });
}
function addImage(dataUrl, w) { // logo or signature (transparent PNG)
 fabric.Image.fromURL(dataUrl, img => { img.scaleToWidth(w || 400); canvas.add(img); });
}
// Undo / redo using JSON snapshots
const hist = [], redo = []; let lock = false;
function snap() {
 if (lock) return;
 hist.push(JSON.stringify(canvas.toJSON(['data'])));
 if (hist.length > 50) hist.shift();
 redo.length = 0;
}
canvas.on('object:added', snap); canvas.on('object:modified', snap); canvas.on('object:removed', snap);
function undo() {
 if (hist.length < 2) return;
 redo.push(hist.pop()); lock = true;
 canvas.loadFromJSON(hist[hist.length - 1], () => { canvas.renderAll(); lock = false; });
}
- Property panel: font family, size, color, bold, italic, alignment, letter spacing, opacity, exact X/Y inputs.
- Layers panel: list canvas.getObjects(), reorder with bringForward / sendBackwards, hide with visible, lock
with selectable.
- Alignment: align to page center (obj.centerH()), snap guides, arrow keys to nudge.
- Fonts: before exporting call await document.fonts.load('160px "Playfair Display"') for every font
used, otherwise the export may use a fallback font.
- Upload backgrounds: PNG/JPG with FileReader. For PDF, render page 1 with pdf.js to a canvas and use it as
the background; say clearly that the original PDF text cannot be edited.
Smart Certificate Generator - Technical Implementation Guide Page 11
- PPTX import: best effort only. Upload to Drive, convert to Google Slides, export as PDF or PNG and use it as a
background. Tell the user text layers become flat.
Step 13 - Dynamic placeholders and the auto-shrink rule
Why this step exists: A 60-character name must not run off the certificate. Auto-shrink makes any name fit.
Auto-shrink
function fitText(obj) {
 const d = obj.data || {};
 if (!d.autoShrink) return;
 let size = obj.fontSize;
 obj.set('fontSize', obj._origSize || size);
 obj._origSize = obj._origSize || size;
 while (obj.getScaledWidth() > d.maxWidth && obj.fontSize > (d.minSize || 40)) {
 obj.set('fontSize', obj.fontSize - 2);
 }
}
Supported placeholders: STUDENT_NAME, EVENT_NAME, EVENT_DATE, CERTIFICATE_ID, CERT_TYPE,
POSITION, COLLEGE, DEPARTMENT, REG_NO, VERIFY_URL (used by the QR object), and any custom column
as CUSTOM:ColumnName.
Step 14 - Save, load and manage templates (JSON)
Why this step exists: Saving as JSON keeps every element editable and lets one design serve many events.
Template save/load
// client
async function saveTemplate(name) {
 const json = canvas.toJSON(['data']);
 json.page = { width: W, height: H };
 const thumb = canvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.12 / canvas.getZoom() });
 return api.saveTemplate({ name, json: JSON.stringify(json), thumb });
}
// server: src/TemplateService.gs
function saveTemplate(t) {
 const folder = getOrCreateFolder_('_templates', getOrCreateFolder_(CFG.ROOT_FOLDER));
 const id = Utilities.getUuid().slice(0, 8);
 const jf = folder.createFile(id + '.json', t.json, 'application/json');
 const tf = folder.createFile(id + '_thumb.txt', t.thumb, 'text/plain');
 registry_().getSheetByName('Templates').appendRow([id, t.name, 'designer', jf.getId(), tf.getId(), new Date()]);
 return { templateId: id };
}
function loadTemplate(id) {
 const v = registry_().getSheetByName('Templates').getDataRange().getValues();
 const r = v.find((x, i) => i > 0 && x[0] === id);
 return DriveApp.getFileById(r[3]).getBlob().getDataAsString();
}
Add listTemplates, duplicateTemplate, renameTemplate, deleteTemplate. Uploaded logos and backgrounds
can be embedded in the JSON as data URLs if small (under about 1 MB each) so a template is one self-contained
file.
Check: design a certificate, save, refresh the browser, reopen: every object is still editable and identical.
Prompt for Antigravity: Build the designer screen with Fabric.js 5.3.1 following Steps 11 to 14: fixed 3508x2480 logical
canvas with fit-to-screen zoom, text, placeholder, image, shape and background tools, property panel, layers,
undo/redo, auto-shrink, and save/load of templates as JSON to Drive via TemplateService.gs.
Smart Certificate Generator - Technical Implementation Guide Page 12
Part F - Participant data: import, validation, mapping
Step 15 - Import Excel, CSV and manual entry in the browser
Why this step exists: Parsing locally is fast, uses no server quota and lets the user fix problems before anything is
saved.
import.html
function readFile(file) {
 return new Promise((resolve, reject) => {
 const r = new FileReader();
 if (/\.csv$/i.test(file.name)) {
 r.onload = () => resolve(Papa.parse(r.result, { header: true, skipEmptyLines: true }).data);
 r.readAsText(file, 'UTF-8');
 } else {
 r.onload = () => {
 const wb = XLSX.read(r.result, { type: 'array' });
 resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
 };
 r.readAsArrayBuffer(file);
 }
 r.onerror = reject;
 });
}
Manual entry: an editable table with Add row, Delete row and paste-from-Excel support. Warn above about 5,000
rows.
Step 16 - Validation engine
Why this step exists: Bad data causes bounced emails and wrong certificates. Catch it before generating.
Validation
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function validate(rows, map) { // map = {name:'Student Name', email:'Email', ...}
 const seen = new Set();
 return rows.map((r, i) => {
 const name = String(r[map.name] || '').trim().replace(/\s+/g, ' ');
 const email = String(r[map.email] || '').trim().toLowerCase();
 let status = 'valid', reason = '';
 if (!name) { status = 'invalid'; reason = 'Missing name'; }
 else if (!EMAIL_RE.test(email)) { status = 'invalid'; reason = 'Invalid email'; }
 else if (seen.has(email)) { status = 'duplicate'; reason = 'Duplicate email'; }
 seen.add(email);
 return { rowIndex: i + 1, name, email, status, reason, raw: r };
 });
}
- Show totals: valid, invalid, duplicate. Allow inline editing and re-validate after each edit.
- Invalid and duplicate rows are saved with validity = invalid/duplicate and email_status = Skipped.
- Offer Download errors as CSV so the organizer can fix the source file.
Step 17 - Column mapping and certificate IDs
Why this step exists: Spreadsheets name columns differently. Mapping connects them to placeholders, and IDs
make each certificate unique.
Mapping and IDs
Smart Certificate Generator - Technical Implementation Guide Page 13
const SYNONYMS = {
 name: ['student name','name','full name','participant','candidate'],
 email: ['email','e-mail','email id','mail','mail id'],
 cert_type: ['certificate type','type','category'],
 position: ['position','rank','prize'],
 reg_no: ['registration number','reg no','roll no','roll number','regd no']
};
function autoMap(headers) {
 const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
 const map = {};
 Object.keys(SYNONYMS).forEach(k => {
 const h = headers.find(x => SYNONYMS[k].includes(norm(x)));
 if (h) map[k] = h;
 });
 return map;
}
function makeCertId(prefix, seq) { return prefix + '-' + String(seq).padStart(3, '0'); } // HW2026-001
function makeToken() {
 const a = new Uint8Array(9); crypto.getRandomValues(a);
 return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
}
Show the automatic suggestion, let the user change it, and save it to the Mapping sheet. The verify_token is
random so nobody can guess other certificates from a sequential ID. Generate IDs once and never change them on
regeneration.
Check: import a 1,000-row file with 20 deliberately bad rows. Exactly 20 are flagged and 980 saved.
Prompt for Antigravity: Implement import.html with the readFile, validate, autoMap, makeCertId and makeToken
functions from Steps 15 to 17, a mapping screen with suggestions, error CSV download, and chunked saving through
saveParticipants in batches of 300 rows with a progress bar.
Smart Certificate Generator - Technical Implementation Guide Page 14
Part G - Preview and PDF generation
Step 18 - Preview screen with a mandatory confirmation
Why this step exists: A wrong spelling printed on 1,000 certificates cannot be undone after emailing. Preview
forces a check.
- Dropdown or next/previous to switch participants; search by name.
- Render the template with that participant's data into the on-screen canvas.
- Show a side panel with the data used, and warnings: text shrunk to minimum, missing field, name too long.
- A checkbox 'I have verified the sample certificates' must be ticked before the Generate button is enabled.
Step 19 - Render and build the PDFs in the browser
Why this step exists: One reusable offscreen canvas is much faster than reloading the template for every
participant.
generate.html
async function generateAll(projectId, tplJson, rows, onProgress, shouldStop) {
 const sc = new fabric.StaticCanvas(null, { width: 3508, height: 2480 });
 await new Promise(res => sc.loadFromJSON(tplJson, res));
 const dyn = sc.getObjects().filter(o => o.data && o.data.dynamic);
 dyn.forEach(o => o.data.tpl = o.text); // remember the {{...}} text once
 for (let i = 0; i < rows.length; i++) {
 if (shouldStop()) break;
 const p = rows[i];
 if (p.gen_status === 'Generated') continue; // resume support
 const vars = { STUDENT_NAME: p.name, EVENT_NAME: p.event_name, EVENT_DATE: p.event_date,
 CERTIFICATE_ID: p.cert_id, CERT_TYPE: p.cert_type, POSITION: p.position,
 VERIFY_URL: VERIFY_BASE + '?id=' + p.cert_id + '&t=' + p.verify_token };
 dyn.forEach(o => { o.set('text', fillVars(o.data.tpl, vars)); fitText(o); });
 await setQr(sc, vars.VERIFY_URL); // replace the QR image object
 sc.renderAll();
 const jpg = sc.toDataURL({ format: 'jpeg', quality: 0.92 });
 const b64 = await makePdf(jpg, p.name + ' - ' + p.cert_id);
 const file = safeName(p.name) + '_' + p.cert_id + '.pdf';
 await uploadWithRetry(projectId, p.rowNum, file, b64);
 onProgress(i + 1, rows.length);
 }
 sc.dispose();
}
function fillVars(t, v) { return t.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => v[k] ?? ''); }
function safeName(n) { return n.normalize('NFKD').replace(/[^\w]+/g, '_').slice(0, 40) || 'cert'; }
pdf.html
async function makePdf(jpgDataUrl, title) {
 const doc = await PDFLib.PDFDocument.create();
 const bytes = Uint8Array.from(atob(jpgDataUrl.split(',')[1]), c => c.charCodeAt(0));
 const img = await doc.embedJpg(bytes);
 const page = doc.addPage([841.89, 595.28]); // A4 landscape in points
 page.drawImage(img, { x: 0, y: 0, width: 841.89, height: 595.28 });
 doc.setTitle(title); doc.setCreator('Smart Certificate Generator');
 return await doc.saveAsBase64();
}
function makeQrDataUrl(text) {
 const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
 return qr.createDataURL(10, 0); // returns a GIF data URL
}
Why a picture inside the PDF: Embedding the rendered image guarantees every font, including Telugu and Hindi,
looks exactly like the preview. The trade-off is that text is not selectable. A later optimization can draw real text with
pdf-lib and embedded TTF fonts.
Step 20 - Upload each PDF to Drive and track generation
Why this step exists: PDFs must be saved safely as they are produced, so a closed tab never loses work.
Upload
Smart Certificate Generator - Technical Implementation Guide Page 15
// server: src/FileService.gs
function savePdf(projectId, rowNum, filename, b64) {
 const { ss, folder } = openProject_(projectId);
 const dir = getOrCreateFolder_('certificates', folder);
 const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/pdf', filename);
 const f = dir.createFile(blob);
 const sh = ss.getSheetByName('Participants');
 writeRow_(sh, rowNum, { pdf_file_id: f.getId(), gen_status: 'Generated' });
 return { fileId: f.getId() };
}
// client
async function uploadWithRetry(pid, rowNum, file, b64) {
 for (let a = 1; a <= 3; a++) {
 try { return await api.savePdf(pid, rowNum, file, b64); }
 catch (e) { if (a === 3) throw e; await new Promise(r => setTimeout(r, 1000 * a * a)); }
 }
}
- Features around it: Generate all, generate selected, regenerate one, download one PDF, download all as ZIP
(JSZip, in parts of about 200), search by name or ID, generation history.
- Pause and cancel buttons call shouldStop(). Reloading the page and pressing Generate again skips rows
already marked Generated.
Check: generate 100 certificates, close the tab at 40%, reopen and resume: 100 files exist, no duplicates, no gaps.
A 60-character name fits. A Telugu name renders correctly.
Prompt for Antigravity: Implement the preview screen and generate.html / pdf.html from Steps 18 to 20, including the
QR object replacement, fitText, resumable generation, retry upload with backoff, a progress bar with ETA, pause and
cancel, and ZIP download in chunks.
Smart Certificate Generator - Technical Implementation Guide Page 16
Part H - Gmail sender, email template and test send
Step 21 - Sender panel: show who will send and how much quota remains
Why this step exists: The organizer must see exactly which account is sending before anything goes out.
Sender info
// server: src/EmailService.gs
function senderInfo() {
 const email = Session.getActiveUser().getEmail();
 const domain = email.split('@')[1];
 return { email, quota: MailApp.getRemainingDailyQuota(),
 kind: /gmail\.com|googlemail\.com/.test(domain) ? 'Personal Gmail' : 'Workspace / other' };
}
- Show 'Sending as: name@gmail.com' and 'Remaining today: N' in a clear banner.
- Button Use a different Gmail: explain that you sign in with the other account (open the app link in the account
chooser or a private window). The first time, Google shows a consent screen for that account.
- Store the sender in the project row (sender_email). If the signed-in account later differs from the saved one,
warn and require confirmation.
- Disconnect: link to https://myaccount.google.com/permissions with simple instructions. The app never holds a
password or token you can see.
Step 22 - Email template builder and server-side rendering
Why this step exists: Each participant must get a personalized message. Rendering on the server prevents
injected HTML.
- Subject and body editors with clickable placeholder chips: STUDENT_NAME, EVENT_NAME, ORG_NAME,
CERTIFICATE_ID, VERIFY_URL.
- Plain-text body with line breaks converted to HTML on the server; optional bold and links.
- Signature block taken from Settings. Save and reuse templates in the EmailTemplates sheet.
- Live preview for any participant.
Rendering
function buildEmail_(tpl, p, ctx) {
 const vars = { STUDENT_NAME: p.name, EVENT_NAME: ctx.event, ORG_NAME: ctx.org,
 CERTIFICATE_ID: p.cert_id, VERIFY_URL: ctx.verifyBase + '?id=' + p.cert_id + '&t=' + p.token };
 const text = render_(tpl.body, vars, false);
 const html = render_(tpl.body, vars, true).replace(/\n/g, '<br>');
 return { subject: render_(tpl.subject, vars, false), text, html };
}
Step 23 - Test send
Why this step exists: Prove the whole path (PDF attachment, display name, formatting) with one real message
before the bulk run.
Test send
function sendTest(projectId, rowNum) {
 const { ss, row } = openProject_(projectId);
 const p = getParticipants(projectId).find(x => x.rowNum === rowNum);
 const tpl = readEmailTemplate_(ss);
 const m = buildEmail_(tpl, { name: p.name, cert_id: p.cert_id, token: p.verify_token },
 { event: row[3], org: row[2], verifyBase: verifyBase_() });
 MailApp.sendEmail({ to: Session.getActiveUser().getEmail(), subject: '[TEST] ' + m.subject,
 body: m.text, htmlBody: m.html, name: row[2],
 attachments: [DriveApp.getFileById(p.pdf_file_id).getBlob()] });
 return { ok: true }; // does NOT change participant status
}
Check: with two accounts, each shows its own address and quota, and each receives a correct test email with the
right PDF. A participant with a missing field is blocked from sending and marked Skipped with a reason.
Smart Certificate Generator - Technical Implementation Guide Page 17
Prompt for Antigravity: Implement EmailService.gs and the sender, email template builder and test send screens from
Steps 21 to 23. Use MailApp, HTML-escape all participant data in the HTML body, and never change participant status
during a test send.
Smart Certificate Generator - Technical Implementation Guide Page 18
Part I - Bulk email engine
Step 24 - Status model and the pre-send checklist
Why this step exists: Clear states make the process understandable and recoverable.
Status Meaning Next
Pending Ready, not sent Processing
Processing Being sent right now (written BEFORE sending) Sent / Failed / Uncertain
Sent Accepted by Gmail for sending (not proof of inbox delivery) final
Failed Send raised an error; reason saved Retry
Retry Failed, waiting for another attempt (max 3) Processing
Uncertain Run crashed while Processing; may or may not have gone out Needs manual review
Skipped Invalid or duplicate; never sent final
Pre-send screen must show: number ready, skipped, already sent; the sender account; subject; largest attachment
size; remaining quota; estimated days (ceil(pending / quota)); and require an explicit tick or typing the recipient
count to confirm.
Why 'Uncertain' exists: If the script dies after calling MailApp but before writing 'Sent', the app cannot know the truth
with the narrow permission. Automatically resending risks a duplicate email; never resending risks a missed one. So the
row is shown to the organizer, who checks the Sent folder and decides. (Advanced option: add the broader Gmail read
permission and search the Sent folder automatically.)
Step 25 - The send loop
Why this step exists: This is the heart of the system. It must be safe to stop at any moment.
BatchService.gs
Smart Certificate Generator - Technical Implementation Guide Page 19
// src/BatchService.gs
function sendBatch(projectId) {
 const lock = LockService.getUserLock();
 if (!lock.tryLock(10000)) return { ok: false, error: 'Another run is active' };
 const t0 = Date.now();
 try {
 const { ss, row } = openProject_(projectId);
 const sh = ss.getSheetByName('Participants');
 markStuckAsUncertain_(sh); // rows left in Processing by a crash
 let ctl = readControl_(ss);
 if (ctl.run_state !== 'running') return { ok: true, state: ctl.run_state };
 const tpl = readEmailTemplate_(ss);
 const ctx = { event: row[3], org: row[2], verifyBase: verifyBase_() };
 const limit = Math.min(Number(ctl.batch_size) || 50, MailApp.getRemainingDailyQuota());
 const data = sh.getDataRange().getValues();
 let sent = 0;
 for (let r = 1; r < data.length && sent < limit; r++) {
 if (Date.now() - t0 > CFG.MAX_RUN_MS) break; // time guard
 if (readControl_(ss).run_state !== 'running') break; // pause / stop honoured
 const v = data[r], st = v[COL.email_status];
 if (st !== 'Pending' && st !== 'Retry') continue;
 if (v[COL.validity] !== 'valid' || !v[COL.pdf_file_id]) continue;
 writeRow_(sh, r + 1, { email_status: 'Processing', attempts: Number(v[COL.attempts]) + 1 });
 try {
 const m = buildEmail_(tpl, { name: v[COL.name], cert_id: v[COL.cert_id], token: v[COL.verify_token] }, ctx);
 MailApp.sendEmail({ to: v[COL.email], subject: m.subject, body: m.text, htmlBody: m.html,
 name: ctx.org, attachments: [DriveApp.getFileById(v[COL.pdf_file_id]).getBlob()] });
 writeRow_(sh, r + 1, { email_status: 'Sent', sent_at: new Date(), last_error: '' });
 log_(ss, r + 1, v[COL.email], 'Sent', '');
 sent++;
 } catch (err) {
 const msg = String(err.message || err);
 const permanent = /invalid|not a valid|no recipient/i.test(msg);
 const quota = /quota|limit exceeded|too many/i.test(msg);
 const tries = Number(v[COL.attempts]) + 1;
 writeRow_(sh, r + 1, { email_status: (permanent || tries >= CFG.MAX_ATTEMPTS) ? 'Failed' : 'Retry',
 last_error: msg.slice(0, 200) });
 log_(ss, r + 1, v[COL.email], 'Failed', msg);
 if (quota) break; // stop the run, schedule later
 }
 Utilities.sleep(CFG.SEND_DELAY_MS);
 }
 return afterRun_(projectId, ss, sh);
 } finally { lock.releaseLock(); }
}
Helpers
function markStuckAsUncertain_(sh) {
 const v = sh.getDataRange().getValues();
 for (let r = 1; r < v.length; r++)
 if (v[r][COL.email_status] === 'Processing') writeRow_(sh, r + 1, { email_status: 'Uncertain' });
}
function readControl_(ss) {
 const v = ss.getSheetByName('Control').getDataRange().getValues();
 const o = {}; v.forEach(r => o[r[0]] = r[1]); return o;
}
function setControl_(ss, key, val) {
 const sh = ss.getSheetByName('Control'), v = sh.getDataRange().getValues();
 const i = v.findIndex(r => r[0] === key);
 if (i >= 0) sh.getRange(i + 1, 2).setValue(val); else sh.appendRow([key, val]);
}
function log_(ss, rowNum, email, status, err) {
 ss.getSheetByName('EmailLog').appendRow([new Date(), rowNum, email, status, err]);
}
Step 26 - Scheduling: continue without the browser, across days
Why this step exists: The script can only run about 6 minutes at a time and the daily quota ends. Triggers carry on
automatically.
Controls and triggers
Smart Certificate Generator - Technical Implementation Guide Page 20
function startSending(projectId, batchSize) { // called by the Start button
 const { ss } = openProject_(projectId);
 setControl_(ss, 'run_state', 'running');
 setControl_(ss, 'batch_size', batchSize);
 PropertiesService.getUserProperties().setProperty('ACTIVE_PROJECT', projectId);
 audit_(ss, 'send_started', 'batch=' + batchSize);
 return sendBatch(projectId);
}
function afterRun_(projectId, ss, sh) {
 const v = sh.getDataRange().getValues();
 const left = v.filter((r, i) => i > 0 && (r[COL.email_status] === 'Pending' || r[COL.email_status] === 'Retry')
 && r[COL.validity] === 'valid').length;
 clearRunTriggers_();
 if (left === 0) { setControl_(ss, 'run_state', 'finished'); return { ok: true, finished: true }; }
 const b = ScriptApp.newTrigger('triggerRun').timeBased();
 if (MailApp.getRemainingDailyQuota() <= 0) b.everyHours(1).create(); // wait for quota to renew
 else b.after(60 * 1000).create(); // more time needed, go again
 return { ok: true, remaining: left };
}
function triggerRun() {
 const id = PropertiesService.getUserProperties().getProperty('ACTIVE_PROJECT');
 if (id && MailApp.getRemainingDailyQuota() > 0) sendBatch(id);
}
function clearRunTriggers_() {
 ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'triggerRun')
 .forEach(t => ScriptApp.deleteTrigger(t));
}
function pauseSending(pid) { setControl_(openProject_(pid).ss, 'run_state', 'paused'); }
function resumeSending(pid) { setControl_(openProject_(pid).ss, 'run_state', 'running'); return sendBatch(pid); }
function stopSending(pid) { setControl_(openProject_(pid).ss, 'run_state', 'stopped'); clearRunTriggers_(); }
- The quota renews on a rolling basis, so the hourly trigger simply checks and exits quickly until sending is allowed
again. This costs very little trigger time.
- The browser only starts the run and then observes it by polling getProgress() every 4 seconds. Closing the
browser never stops or duplicates sending.
- Triggers belong to the account that created them, so sending continues as the selected sender.
Step 27 - Retry, resume and manual resend
Why this step exists: Real campaigns always have a few failures. Recovery must be simple and safe.
- Retry failed: set email_status from Failed to Retry (not above max attempts unless the user forces it) and start a
run.
- Review Uncertain: a table of Uncertain rows with buttons 'It was sent' (mark Sent) and 'Send again' (mark
Pending).
- Resend one: requires a confirmation dialog and writes an audit entry.
- Duplicate protection: by default the same email address is sent only once per project.
Check (all must pass): send 10 with batch size 5; close the tab mid-run and see it continue; force an exception on
one row and see only that row fail; click Start twice quickly and see only one run (lock); simulate quota exhaustion
and see a paused state with 'Next automatic run' shown.
Prompt for Antigravity: Implement BatchService.gs exactly as in Steps 24 to 27 with LockService, time guard, status
writes before and after each email, Uncertain handling, triggers and pause/resume/stop. Add unit-style test functions
that run against a project with 10 test participants using my own addresses.
Smart Certificate Generator - Technical Implementation Guide Page 21
Part J - Tracking, reports and certificate verification
Step 28 - Live monitoring dashboard
Why this step exists: The organizer needs to see progress and act on problems without opening the spreadsheet.
Progress
function getProgress(projectId) {
 const { ss } = openProject_(projectId);
 const v = ss.getSheetByName('Participants').getDataRange().getValues();
 const c = { Pending: 0, Processing: 0, Sent: 0, Failed: 0, Retry: 0, Uncertain: 0, Skipped: 0 };
 for (let i = 1; i < v.length; i++) { const s = v[i][COL.email_status]; if (s in c) c[s]++; }
 const ctl = readControl_(ss);
 const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'triggerRun').length;
 return { counts: c, total: v.length - 1, state: ctl.run_state, quota: MailApp.getRemainingDailyQuota(),
 nextRunScheduled: triggers > 0 };
}
- Show totals, a progress bar, per-status counts, quota left, run state and 'Next automatic run'.
- Buttons: Pause, Resume, Stop, Retry failed.
- Tracking table: search by name, email or certificate ID, filter by status, show the error text, per-row actions.
Step 29 - Reports and honest status wording
Why this step exists: Reports are used by the college afterwards, so they must be accurate.
- Export CSV and XLSX: name, email, certificate ID, status, sent time, error, sender account.
- Use the word Sent (accepted by Gmail). Do not claim 'Delivered'. Actual delivery needs bounce checks.
- Optional bounce detection later: search the sender's inbox for mailer-daemon messages (needs a broader Gmail
read permission) and mark rows Bounced.
Step 30 - Certificate verification site and QR
Why this step exists: Anyone who scans the QR on a certificate should be able to confirm it is genuine without
logging in.
Create a second Apps Script project (for example 'Certificate Verifier'), owned by the organization account,
deployed as Execute as: Me, Who has access: Anyone (anonymous). It reads a public registry sheet that contains
only the minimum needed data.
Registry column Example Note
cert_id HW2026-001 shown to the visitor
token k3x9a1b7q2mz random; must match the QR link
name, event, organization, cert_type,
date
Ravi Kumar, Hackathon 2026, ... no email address ever
status valid / revoked organizer can revoke
Public verification page
Smart Certificate Generator - Technical Implementation Guide Page 22
// Verifier project: Code.gs
function doGet(e) {
 const id = String(e.parameter.id || '').trim(), t = String(e.parameter.t || '').trim();
 const sh = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('REGISTRY_ID'))
 .getSheetByName('Certs');
 const v = sh.getDataRange().getValues();
 const hit = v.find((r, i) => i > 0 && r[0] === id && r[1] === t);
 let html;
 if (!hit) html = '<h2>Not found</h2><p>This certificate could not be verified.</p>';
 else if (hit[7] !== 'valid') html = '<h2>Revoked</h2><p>This certificate is no longer valid.</p>';
 else html = '<h2>Valid certificate</h2><p><b>' + esc(hit[2]) + '</b><br>' + esc(hit[3]) + '<br>' +
 esc(hit[4]) + '<br>' + esc(hit[5]) + '<br>ID: ' + esc(id) + '</p>';
 return HtmlService.createHtmlOutput('<meta name=viewport content="width=device-width,initial-scale=1">' + html)
 .setTitle('Certificate Verification');
}
function esc(s) {
 return String(s).replace(/[&<>"']/g, c =>
 ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
- Share the registry spreadsheet with the organizer accounts (Editor) so the main app can append rows when
certificates are generated and set status to revoked when needed. Alternative: add a doPost endpoint protected
by a secret key.
- QR link format: VERIFIER_URL?id=HW2026-001&t=<token>. Put the verifier URL in Settings (verifyBase_()).
- Never show email, phone or registration numbers on this public page.
- Add a Revoke and Restore button in the main app that updates the registry row.
Check: scan the QR from a generated PDF with a phone: Valid appears with name and event. Revoke it: the page
shows Revoked. Change one character of the token: Not found.
Prompt for Antigravity: Create the tracking dashboard and reports from Steps 28 and 29, and a separate Apps Script
verifier project from Step 30. Add registry writes during generation and revoke/restore from the main app.
Smart Certificate Generator - Technical Implementation Guide Page 23
Part K - Security, testing, deployment, operations
Step 31 - Security hardening checklist
Why this step exists: The app handles student names and email addresses. These controls protect them.
Control How to implement
No passwords or tokens handled Google sign-in only; MailApp uses the signed-in user's authorization
Ownership check on every server call All functions use openProject_, which reads only this user's registry
No HTML injection textContent in the UI; escapeHtml_ in email HTML; escape in the verifier
Private storage All files stay in the user's private Drive folder; only the verifier registry is shared
Upload limits Accept only png, jpg, pdf, xlsx, csv, pptx; reject files over a size limit
Safe file names safeName() strips unusual characters
Pinned libraries Exact CDN versions; never latest
Duplicate prevention Status written before sending; lock; one email per address per project
Audit trail audit_() on create, import, generate, start, pause, stop, resend, revoke, delete
Confirmation for bulk send Pre-send screen with explicit confirmation
Deletion Delete project data button removes participants, PDFs and logs
Privacy notice Short on-screen note on how student data is used and deleted
Step 32 - Testing plan
Why this step exists: Test the risky parts deliberately, not by hope.
Area Test
Identity Two Google accounts show different sender, quota and data
Import 1,000 rows with 20 bad rows; duplicates; blank names; BOM CSV; Excel with extra sheets
Designer Save, reopen, undo/redo 20 steps; fonts loaded before export
Names 60 characters; Telugu; Hindi; apostrophes; very short names
PDF Generate 100 and 1,000; check file size, memory, resume after closing the tab
Email Test send; 10-recipient run with batch size 5; wrong address; missing PDF file
Resilience Close the tab mid-run; force an exception; double-click Start; quota exhaustion
Security Try another user's project ID; name containing <script>; oversize upload
Verification Valid, revoked, wrong token, unknown ID
Keep a permanent fixture of 10 sample participants that includes every edge case, and rerun it after each phase.
Step 33 - Deployment
Why this step exists: A versioned deployment gives users a stable link while you keep developing.
- clasp push to upload code; in the Apps Script editor use Deploy > Manage deployments > Edit > New
version to update the live link (the URL stays the same).
- Keep two deployments: Test (head, for you) and Production (versioned, for users).
- Main app: Execute as User accessing the web app; access Anyone with Google account (or your college
domain only if you use Workspace).
- Verifier app: Execute as Me; access Anyone.
- First-time users see Google's 'unverified app' screen for sensitive permissions. They choose Advanced and
continue. For public distribution beyond your own organization, plan for Google's OAuth verification.
Smart Certificate Generator - Technical Implementation Guide Page 24
- Write a one-page user guide with screenshots: sign in with the sender Gmail, upload, preview, generate, send,
and what 'Sent' means.
Step 34 - Operations and troubleshooting
Why this step exists: These are the problems you will actually meet.
Symptom Likely cause Fix
Authorization required User has not granted permissions Reopen the app and accept the consent screen
Exceeded maximum execution
time
Loop ran past 6 minutes Lower MAX_RUN_MS or batch size; trigger
continues
Service invoked too many times Per-cell sheet calls Switch to range reads and writes
Email quota reached Daily limit used Run pauses; resumes automatically when quota
returns
Upload fails for large PDFs Payload too big Use JPEG quality 0.85-0.9; one PDF per call
Fonts look different in the PDF Font not loaded before export await document.fonts.load for each font
Emails go to spam Many similar emails from a new
account
Plain wording, no short links, small test first
clasp pushes JS as server code .js extension used for browser code Put browser code in .html files
Smart Certificate Generator - Technical Implementation Guide Page 25
Part L - Build schedule, Antigravity workflow and final
checklist
L1. Suggested schedule (one developer, with an AI agent)
Week Work Exit criteria
1 Parts B, C, D: setup, backend foundation, UI shell Create and list projects; two-account test passes
2 Part E: designer and template library Design, save, reopen
3 Part F: import, validation, mapping 1,000 rows import with correct flags
4 Part G: preview, PDF generation, upload, ZIP 1,000 PDFs, resumable
5 Parts H and I: sender, email builder, bulk engine Safe batch sending with resume
6 Part J: tracking, reports, verifier, QR QR verifies on a phone
7 Part K: security, testing, deployment, user guide Full checklist passes
L2. How to drive Antigravity effectively
- Create docs/SPEC.md in the repo and put this guide in it, so the agent can re-read it.
- Give one step or one part per task. Ask for a short plan and the file list before any code.
- Use the prompts shown after each part. Add: 'Do not change files outside this scope.'
- After each task ask the agent to explain how to test, then run the check yourself.
- Ask it to commit after each passing step so you can roll back.
- If something fails, paste the exact error and the function name, not a description.
- Never let the agent change the status-writing order in the send loop (write Processing, send, write Sent). That
order is what prevents duplicates.
L3. Final definition of done
- Create a project, design or upload a template, import 1,000 participants, fix errors, map columns and preview.
- Generate 1,000 unique PDFs, resume correctly after closing the tab.
- Sign in with the chosen Gmail, see it as the sender, send a test, then start the bulk send.
- Close the browser; sending continues in batches, pauses at quota, resumes later.
- Every participant ends as Sent, Failed (with reason), Skipped (with reason) or Uncertain (for review).
- No participant receives two emails.
- A downloadable report matches the sheet; a QR scan shows Valid; revoke shows Revoked.
- Security checklist and test plan pass.
Optional upgrades after launch: Vector text PDFs with embedded fonts; automatic Uncertain reconciliation; bounce
detection; participant self-service download portal (unlimited, no email quota); multi-user organizations; a Node/Firebase
backend with the Gmail API if you outgrow Apps Script limits