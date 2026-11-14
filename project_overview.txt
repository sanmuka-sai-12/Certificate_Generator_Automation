Smart Certificate Generator & Bulk Email Automation
Step-by-step implementation plan and technical requirements (build brief for Antigravity)
0. How to use this document with Antigravity
1.  Paste Section 1 (Master Prompt) first, so the agent knows the goal, stack and rules.
2.  Then give one phase at a time (Sections 6 to 11). Do not ask for the whole product in one go.
3.  After each phase, run the acceptance tests listed in that phase before starting the next one.
4.  Keep this document in the repo as /docs/SPEC.md so the agent can re-read it.
1. Master Prompt (paste this first)
You are building "Smart Certificate Generator", a free, standalone web app for colleges and event organizers. Workflow: create project, choose or design a certificate template, import participants (Excel/CSV/manual), map columns to placeholders, preview, generate one personalized PDF per participant, choose a sender Gmail account via Google OAuth, configure an email template, send individual emails with the PDF attached in controlled batches, track status, and verify certificates via QR code.
Stack: Google Apps Script (HtmlService web app, V8 runtime) as backend and host; Google Sheets as database; Google Drive for files; Gmail via GmailApp; vanilla HTML/CSS/JS frontend; Fabric.js for the designer; pdf-lib for PDF; SheetJS and PapaParse for imports; JSZip for ZIP; a QR library. Use clasp for local development and deployment.
Hard rules: never collect or store Gmail passwords; never expose tokens in the frontend; request minimum OAuth scopes; save progress after every single email; never send the same participant twice; respect Gmail quotas and pause automatically when exhausted; keep templates as structured JSON; every project has isolated data; require explicit confirmation before bulk sending; write clean modular code with comments; write tests where possible.
Work in phases. Before coding each phase, produce a short plan and the file list, then implement, then list how to test it.
2. Key architecture decisions (read before building)
2.1 How "choose any Gmail account" actually works in Apps Script
There are two ways to deploy an Apps Script web app, and this choice drives everything:
Deployment mode
Who sends the email
Consequence
Execute as User accessing the web app (recommended)
The Google account that is logged in and authorizes the app
Each organizer signs in with the Gmail they want to send from. Data lives in that user's own Drive and Sheets. Truly "choose sender each time" by signing in with that account.
Execute as Me
Always the script owner
Single fixed sender. Does not meet the requirement.
Recommendation: use "User accessing the web app". The sender is shown on screen from Session.getActiveUser().getEmail() before sending. Switching sender means opening the app in the other Google account (account chooser) and authorizing it once. To share a project across accounts, the project spreadsheet and folder can be shared in Drive.
Honest limitation: Apps Script does not let one session hold several Gmail tokens at once. If you later need one session with a dropdown of many stored senders, use Plan B (Section 14): a small Node/Firebase backend with the Gmail API and encrypted refresh tokens.
2.2 Where work happens
Task
Where
Why
Designer, preview
Browser
Fabric.js is client-side
Excel/CSV parsing and validation
Browser
Fast, no server quota used
PDF generation
Browser (pdf-lib)
Avoids the 6-minute Apps Script limit and Drive conversion quotas
Store PDFs, templates, data
Apps Script to Drive and Sheets
Persistent storage
Sending email
Apps Script (GmailApp)
Uses the authorized account
Resume across days
Apps Script time-driven trigger
Quota resets daily
2.3 PDF strategy
• Default mode (recommended): raster-in-PDF. Render the Fabric canvas to a high-resolution PNG (300 DPI equivalent), embed it as a full-page image in a PDF. This guarantees every font and effect renders exactly as previewed, including Telugu, Hindi and other Unicode names.
• Optional vector mode (later): embed TTF fonts with pdf-lib plus fontkit and draw real text so it is selectable and smaller. Only after the default mode is stable.
• Keep each PDF under about 1 MB (JPEG background at quality 0.9 where no transparency is needed) so 1,000 certificates stay within Drive limits.
2.4 Hard platform limits to design around
Limit
Value (verify at build time, Google can change these)
Design response
Email recipients per day, consumer Gmail
about 100
Daily quota check, resume next day
Email recipients per day, Workspace
about 1,500
Same
Script execution time
about 6 minutes
Batch loop checks elapsed time, exits at ~5 min, trigger continues
Email size
25 MB including attachments
Validate PDF size before sending
google.script.run payload
Keep each call small (under about 5 MB)
Upload PDFs one at a time or in small chunks
Trigger runtime per day
Limited
Use one trigger per project run, delete when done
Drive storage
15 GB shared (personal)
Show storage usage in settings
3. Repository structure
certgen/
  .clasp.json
  appsscript.json
  src/
    server/
      Code.gs              // doGet, include(), router
      Config.gs            // constants, sheet names, column maps
      Auth.gs              // current user, sender verification
      ProjectService.gs
      TemplateService.gs
      ParticipantService.gs
      FileService.gs       // Drive folders, PDF upload
      EmailService.gs      // quota, send, templates
      BatchService.gs      // queue, lock, triggers, resume
      VerifyService.gs     // certificate lookup, revoke
      ReportService.gs
      AuditService.gs
      Utils.gs
    client/
      index.html           // shell + router
      css/ app.css
      js/
        app.js             // routing, state store
        api.js             // wrapper around google.script.run (promises)
        dashboard.js
        projects.js
        designer/          // fabric canvas, tools, layers, history, schema
        import.js          // SheetJS / PapaParse, validation
        mapping.js
        preview.js
        pdf.js             // pdf-lib generation
        generate.js        // bulk generate + upload queue
        email.js           // template builder, preview
        send.js            // batch controls, monitor
        tracking.js
        settings.js
    verify/                // public verification page (separate deployment)
  tests/
  docs/SPEC.md
4. Data model (Google Sheets)
Use one Registry spreadsheet per user plus one spreadsheet per project, so each project is fully isolated and deletable.
4.1 Registry spreadsheet (auto-created on first login)
Sheet
Columns
Projects
project_id, name, organization, event_name, event_date, cert_type, template_id, sheet_id, folder_id, sender_email, status, created_at, updated_at
Templates
template_id, name, type, width_px, height_px, orientation, json_file_id, thumb_file_id, created_at
EmailTemplates
et_id, name, subject, body, created_at
Settings
key, value (default size, PDF quality, batch size, org details, signature)
4.2 Per-project spreadsheet
Sheet
Columns
Participants
row_id, name, email, cert_type, college, department, reg_no, position, custom_json, cert_id, validity (valid/revoked/invalid), pdf_file_id, gen_status, email_status, attempts, last_error, sent_at, message_id
Mapping
placeholder, column
EmailLog
log_id, row_id, email, status, timestamp, error, message_id
Audit
timestamp, actor, action, details
Control
key, value (run state: idle/running/paused/stopped, cursor, lock info, trigger id, last_quota_check)
Rules: always read and write with ranges (getValues / setValues) in bulk, never cell by cell. Add a header row and a schema version. Never put access tokens in Sheets.
4.3 Drive folder layout (private, created by the app)
CertGen/
  _templates/
  Project_<id>_<name>/
    certificates/
    exports/
    uploads/
5. Designer JSON schema (template format)
Templates must be stored as JSON, never as flattened images only.
{
  "version": 1,
  "page": { "width": 3508, "height": 2480, "unit": "px", "orientation": "landscape" },
  "background": { "type": "image", "fileId": "DRIVE_FILE_ID", "color": "#ffffff" },
  "objects": [
    { "id": "o1", "type": "text", "text": "CERTIFICATE OF PARTICIPATION",
      "x": 1754, "y": 500, "originX": "center", "fontFamily": "Playfair Display",
      "fontSize": 120, "fill": "#1a1a1a", "align": "center", "layer": 3 },
    { "id": "o2", "type": "text", "text": "{{STUDENT_NAME}}", "dynamic": true,
      "x": 1754, "y": 1150, "fontSize": 160, "autoShrink": true, "maxWidth": 2400 },
    { "id": "o3", "type": "image", "role": "logo", "fileId": "...", "x": 200, "y": 150, "w": 300, "h": 300 },
    { "id": "o4", "type": "qr", "value": "{{VERIFY_URL}}", "x": 3000, "y": 1950, "size": 300 }
  ]
}
Supported placeholders: {{STUDENT_NAME}}, {{EVENT_NAME}}, {{EVENT_DATE}}, {{CERTIFICATE_ID}}, {{CERT_TYPE}}, {{POSITION}}, {{COLLEGE}}, {{DEPARTMENT}}, {{REG_NO}}, {{VERIFY_URL}}, plus any custom column as {{CUSTOM:<column>}}.
Important behaviors: long names must auto-shrink to maxWidth (minimum font size configurable) so text never overflows; page size defaults to A4 landscape at 300 DPI (3508 x 2480 px).
6. PHASE 1 – Foundation, frontend shell and dashboard
Goal: a deployed web app with login identity, navigation, projects and settings.
Steps
1.  Environment setup
    ◦ Install Node.js and clasp; run clasp login; clasp create --type webapp.
    ◦ In appsscript.json set "runtimeVersion": "V8", "timeZone" to Asia/Kolkata, and "webapp": {"executeAs": "USER_ACCESSING", "access": "ANYONE_WITH_GOOGLE_ACCOUNT"}.
    ◦ Declare minimal OAuth scopes (add only when needed): userinfo.email, drive.file, spreadsheets, gmail.send, script.scriptapp, script.external_request (only if required).
2.  Server router (Code.gs)
    ◦ doGet(e) returns HtmlService.createTemplateFromFile('client/index').evaluate() with setXFrameOptionsMode(ALLOWALL) as needed.
    ◦ include(filename) helper to compose HTML, CSS and JS partials.
3.  API wrapper (api.js)
    ◦ Promise wrapper over google.script.run with withSuccessHandler, withFailureHandler, a standard response shape {ok, data, error}, and a global error toast.
4.  First-run bootstrap
    ◦ On first load: create the CertGen Drive folder and the Registry spreadsheet; store IDs in PropertiesService.getUserProperties().
5.  Project CRUD (ProjectService.gs): create, read, update, duplicate, archive, delete; creating a project also creates its spreadsheet and folder.
6.  UI shell: left sidebar (Dashboard, Projects, Templates, Email Templates, Settings), top bar showing the signed-in Gmail, responsive layout, light/dark theme.
7.  Dashboard: stat cards (Total Projects, Total Participants, Generated, Emails Sent, Pending, Failed) computed from project sheets; recent projects list; "New Project" wizard.
8.  Settings page: organization details, default certificate size, PDF quality, default batch size, email signature, storage usage, "Delete project data".
9.  Audit logging helper used by every later phase.
Acceptance tests
• Open the web app in two different Google accounts: each gets a separate registry and sees only its own projects.
• Create, duplicate and delete a project; Drive folder and sheet are created and removed accordingly.
• No hard-coded IDs; app works after redeploying.
7. PHASE 2 – Certificate designer and template library
Goal: upload or design a template, place dynamic fields, save/reopen as JSON.
Steps
1.  Canvas core: Fabric.js (pin a stable 5.x version from a CDN such as cdnjs). Create a fixed-size logical canvas (e.g. 3508 x 2480) scaled to fit the viewport with zoom and pan. Keep logical coordinates independent of screen scale.
2.  Template source A – upload:
    ◦ PNG/JPG: read as data URL, set as locked background, check resolution and warn if below about 150 DPI equivalent.
    ◦ PDF: render page 1 with pdf.js into a canvas, use as background (state clearly that text in the original PDF is not editable).
3.  Template source B – built-in designer: background color/gradient/image, border and shapes, text, image/logo upload, signature upload (transparent PNG), QR placeholder object.
4.  Property panel: font family (bundle Google Fonts: Playfair Display, Great Vibes, Montserrat, Poppins, Noto Sans, Noto Sans Telugu, Noto Sans Devanagari), size, color, bold/italic, alignment, letter spacing, line height, opacity, rotation, exact X/Y/W/H inputs, lock, delete.
5.  Dynamic placeholder tool: an "Insert field" dropdown that inserts {{...}} text objects, highlighted in the editor with a distinct style; each has autoShrink and maxWidth.
6.  Layers panel (reorder, hide, lock), alignment tools (align to page center, distribute, snap guides), undo/redo (command stack of canvas JSON snapshots, limit 50), keyboard shortcuts.
7.  Template source C – import:
    ◦ PPTX is best-effort: upload to Drive, convert to Google Slides, export as PDF/PNG (Drive/Slides advanced service) and use as a background; show a notice that text layers become flat. Do not promise full editable conversion.
8.  Save/load: serialize to the JSON schema in Section 5; upload JSON and a thumbnail to Drive; list in the Template Library with duplicate, rename, delete, tag by certificate type.
9.  Image handling: store uploaded logos, signatures and backgrounds in Drive; reference by file ID; load into the editor through the server as base64 (small images) to avoid CORS problems in the sandboxed iframe.
Acceptance tests
• Design a certificate, save, close, reopen: identical layout and editable objects.
• Upload an A4 PNG background; place {{STUDENT_NAME}}; export looks identical to the canvas.
• Undo/redo works across at least 20 operations.
• Fonts used in the design load before export (wait for document.fonts.ready).
8. PHASE 3 – Participant data, mapping, preview and PDF generation
Goal: import, validate, map, preview, and bulk generate PDFs.
Steps
1.  Import (client side): SheetJS for .xlsx, PapaParse for .csv (UTF-8 and BOM-safe); manual-entry grid with add/edit/delete row and paste-from-Excel support; hard limit warning above about 5,000 rows.
2.  Validation engine (import.js): trim and normalize whitespace; detect missing names; email regex plus a basic domain check; lowercase emails; flag duplicate emails and duplicate name+email records; show counts of total, valid, invalid; row-level inline editing; mark invalid rows as Skipped with a reason; export an errors CSV.
3.  Auto-mapping: match column headers to placeholders using normalization and a synonym table (e.g. "Student Name", "Name", "Full Name" map to STUDENT_NAME; "Mail", "Email ID" map to email). Show the suggestion, allow overrides, save to the Mapping sheet.
4.  Certificate ID generator: configurable pattern like {PREFIX}{YEAR}-{SEQ:3} (e.g. HW2026-001), guaranteed unique per project, stored once and never regenerated (regeneration reuses the same ID). For verification security also create a random verify_token (at least 12 characters) so IDs cannot be guessed from the sequence.
5.  Save participants to Sheets in chunks of 200 to 500 rows per server call.
6.  Preview screen: render the template for any participant with next/previous/search, side-by-side "data vs certificate" view, checks for overflow, missing fields and page size; a mandatory "I have verified the preview" checkbox before generation unlocks.
7.  PDF generator (pdf.js, generate.js):
    ◦ For each participant: clone the template JSON, substitute placeholders, render to an offscreen Fabric StaticCanvas, export PNG/JPEG, embed in pdf-lib page with exact page size, add PDF metadata (title, author), return bytes.
    ◦ Generate QR codes locally (no external API calls) pointing to {{VERIFY_URL}}.
    ◦ Process with concurrency of 1 to 2 and await between items so the UI stays responsive; show progress bar, ETA, pause and cancel.
8.  Upload queue: after each PDF, send base64 to FileService.savePdf(projectId, rowId, filename, base64), which stores it in the project's certificates folder and writes pdf_file_id and gen_status=Generated. Retry uploads up to 3 times with backoff. Resume support: on reload, only generate rows where gen_status != Generated.
9.  File naming: <Sanitized_Name>_<CertID>.pdf, ASCII-safe filename while the certificate keeps the real Unicode name.
10.  Certificate management: search by name or ID, regenerate selected, download single PDF, download all as ZIP (stream with JSZip in chunks; for very large projects offer ZIP in parts of 200).
Acceptance tests
• Import a 1,000-row file with 20 bad rows: all 20 flagged, 980 valid.
• Generate 100 certificates; reload mid-run and resume without duplicates or missing files.
• A 60-character name fits inside the placeholder area via auto-shrink.
• Telugu/Hindi names render correctly.
• No certificate is generated before the preview confirmation.
9. PHASE 4 – Gmail identity and email template builder
Goal: show the verified sender, build the email, preview it, send a test.
Steps
1.  Sender panel: show Session.getActiveUser().getEmail() as "Sending as", the account type (consumer or Workspace based on domain, best-effort), and remaining quota from MailApp.getRemainingDailyQuota(). Provide a "Use a different Gmail" button that explains how to sign in with another account and opens the app URL with ?authuser= or the Google account chooser.
2.  Authorization flow: the first server call that touches Gmail triggers Google's consent screen. Handle the authorization-required error with a clear instruction screen. Save sender_email to the project.
3.  Disconnect: link to Google's account permissions page (myaccount.google.com/permissions) with instructions; clear local project binding.
4.  Email template builder: subject and body editors with placeholder chips ({{STUDENT_NAME}}, {{EVENT_NAME}}, {{ORG_NAME}}, {{CERTIFICATE_ID}}, {{VERIFY_URL}}), plain text plus simple HTML (bold, links, line breaks), signature block from settings, sender display name, optional reply-to, live preview for any participant, save/reuse templates.
5.  Test send: button to send one test email with a real certificate to the sender's own address (test sends do not change participant status and do not count as participant sends in reports).
6.  Server-side rendering: placeholder substitution happens on the server for the final email, with HTML-escaping of participant data to prevent injection.
Acceptance tests
• Two different accounts each show their own sender address and quota.
• Test email arrives with the correct PDF attached and correct display name.
• Placeholder with missing data blocks sending for that row (marked Skipped with reason).
10. PHASE 5 – Bulk email engine (most critical phase)
Goal: safe, resumable, quota-aware sending with no duplicate emails.
State machine per participant
Pending to Processing to Sent or Failed; Failed to Retry to Processing; invalid or duplicate rows are Skipped.
Steps
1.  Pre-send checklist screen: counts of ready, skipped, already sent; selected sender; subject; attachment size check; quota remaining; estimated number of days needed (ceil(pending / min(quota, remaining))); explicit confirm (type the number of recipients or tick "I confirm").
2.  Batch configuration: choose 25, 50 or 100 per batch plus an optional delay between emails (default 1 to 2 seconds). The effective batch is min(batch size, remaining quota).
3.  Send engine (BatchService.gs)
    ◦ Acquire LockService.getScriptLock() (or user lock) so two runs cannot overlap; release in finally.
    ◦ Read pending rows; for each row, before sending: write Processing and attempts+1 immediately.
    ◦ Send with GmailApp.sendEmail(to, subject, plainBody, {htmlBody, attachments:[blob], name, replyTo}).
    ◦ Immediately after success: write Sent, sent_at, and log to EmailLog. On exception: write Failed with a short error; classify errors (invalid address, quota exceeded, service error, attachment missing).
    ◦ Stop the loop when: quota is 0, elapsed time exceeds about 5 minutes, user pressed pause/stop, or the batch size is reached.
4.  Idempotency (no duplicates): if a run crashed while a row was Processing, on resume do not blindly resend. First check Gmail's Sent mail with GmailApp.search('in:sent to:<email> subject:"<subject>"') limited to recent days; if found, mark Sent (reconciled), otherwise reset to Pending. Also dedupe by email within a project unless the user explicitly allows duplicates.
5.  Run control: Control sheet holds run_state (running/paused/stopped) checked every iteration; Pause, Resume, Stop, Retry failed, Send selected operate through it.
6.  Automation across days: when quota is exhausted or time is near the limit, create a time-driven trigger (ScriptApp.newTrigger('resumeSending').timeBased().after(...) for same-day continuation, or .atHour(...).everyDays(1) for the next day), store the trigger ID in Control, and delete triggers when all rows are processed or the user stops. Show "Next automatic run: <date time>" in the UI.
7.  Client monitoring: poll getProgress(projectId) every 3 to 5 seconds while the page is open; keep the server loop independent of the browser (browser closing must not stop or duplicate sending: sends run via trigger-driven batches, the browser only starts them and observes).
8.  Retry policy: automatic retry for transient errors up to 3 attempts with exponential backoff; permanent errors (invalid address) are not retried.
Acceptance tests
• Send 10 emails with batch size 5: two batches, correct statuses, correct attachments.
• Kill the tab mid-run: sending continues via trigger; no email is sent twice.
• Simulate quota exhaustion: run pauses with status message and schedules the next run.
• Force an exception on one row: only that row fails, run continues.
• Run "Start" twice quickly: the lock prevents a double run.
11. PHASE 6 – Tracking, verification, reports and hardening
Steps
1.  Monitoring dashboard: totals, progress bar, per-status counts, current batch, quota remaining, next scheduled run, live log, buttons (Pause, Resume, Stop, Retry failed).
2.  Tracking table: search by name/email/certificate ID, filter by status, view error text, per-row actions (retry, regenerate, resend manually with a confirmation and an "allow duplicate" flag).
3.  Reports: export CSV and XLSX (name, email, cert ID, status, sent_at, error, sender). Make clear that Sent = accepted by Gmail, not guaranteed inbox delivery. Optional bounce detection: periodically search the sender's inbox for from:mailer-daemon messages, parse the failed recipient and mark Bounced.
4.  Certificate verification (separate public deployment):
    ◦ Public web app deployed "Execute as me" / "Anyone" owned by the organization, with a public registry sheet containing only: cert_id, verify_token, name, event, organization, type, date, status (valid/revoked).
    ◦ URL format <verify_app_url>?id=HW2026-001&t=<token>; the page shows Valid / Revoked / Not found, with no email addresses or other private data.
    ◦ Organizer can revoke or restore from the main app, which updates the public registry.
    ◦ Rate-limit lookups and never reveal sequential enumeration.
5.  Security hardening (checklist):
    ◦ All server functions validate the caller owns the project (check IDs against the user's registry).
    ◦ Escape all participant data before rendering HTML (textContent or a sanitizer); never use innerHTML with raw data.
    ◦ Sanitize filenames; limit upload sizes and types (png, jpg, pdf, xlsx, csv, pptx).
    ◦ No secrets in client code; use PropertiesService for configuration.
    ◦ Private Drive folders only; nothing is shared publicly except the verification registry.
    ◦ Audit log for create, import, generate, send, pause, revoke and delete.
    ◦ Data deletion: one button removes participants, PDFs and logs for a project.
    ◦ Privacy note on screen about handling student data.
6.  Performance: batch Sheets operations, cache registry reads with CacheService, lazy-load heavy libraries (PDF, ZIP) only on the screens that need them.
7.  Accessibility and UX polish: keyboard navigation, loading states, empty states, confirmation dialogs for destructive actions, mobile-friendly dashboard.
Acceptance tests
• Scan a QR code on a generated PDF: verification page shows Valid with minimal data.
• Revoke a certificate: verification page shows Revoked within a minute.
• An unauthorized user cannot read another user's project by guessing IDs.
• Export report matches Sheets data exactly.
12. Deployment and operations
1.  Use clasp push and clasp deploy with versioned deployments; keep a dev deployment (head) and a production deployment (versioned).
2.  Publish the main app: Execute as User accessing the web app, access Anyone with Google account (or restrict to your college's domain if Workspace).
3.  OAuth consent screen: for personal use or small groups, keep the app in testing/internal mode. Note that sensitive scopes such as gmail.send trigger an "unverified app" warning for external users, and broader public use requires Google's OAuth verification.
4.  Document a one-page user guide: how to sign in with a chosen Gmail, quota expectations (about 100 per day consumer, about 1,500 Workspace), and what "Sent" means.
5.  Plan a quota notice on the send screen, for example "1,000 participants on a free Gmail account needs about 10 days."
13. Testing strategy
Level
What to test
Unit
Placeholder substitution, ID generator, email validation, name sanitization, column auto-mapping, quota/batch math
Integration
Import, save, generate, upload, send for 5 to 10 test participants using your own Gmail addresses
Load
Generate 1,000 PDFs (time, memory, Drive file count); import 5,000 rows
Resilience
Close tab mid-run, network drop, quota exhaustion, trigger recovery
Security
Cross-account access, HTML injection in names (e.g. <script>), oversized uploads
Content
Long names, Unicode names, empty optional fields
Use a fixed set of 10 sample participants (including edge cases) as a permanent test fixture.
14. Plan B (if Apps Script limits become blocking)
Use this if you need a dropdown of many stored sender accounts, higher throughput, or server-side PDF rendering:
• Frontend: the same HTML/JS (or React/Next.js).
• Backend: Node.js (Firebase Functions or Cloud Run free tier) using the Gmail API with Google OAuth 2.0 authorization code flow and encrypted refresh tokens per sender.
• Database/storage: Firestore or Supabase; Cloud Storage for PDFs.
• Queue: Cloud Tasks or a scheduled function for batch sending.
• Reality check: Gmail API still applies Google's sending limits; hosting may need a billing-enabled account even if usage stays in the free tier.
The module boundaries in this plan (Design Engine, Generation Engine, Email Engine) are kept so the backend can be swapped without rewriting the UI.
15. Risks and honest notes
• Free does not mean unlimited: daily recipient quotas, 6-minute executions and Drive storage are real constraints.
• Deliverability: many identical emails with attachments from a new consumer Gmail may land in spam; recommend a clear subject, no URL shorteners, plain wording, and sending a small test first.
• PPTX import will never be perfect; treat it as a background import.
• Quotas and policies change: re-check Google's current Apps Script quota page before launch and keep limits in a Config.gs file so they are easy to update.
• Student data privacy: collect only what is needed, keep Drive folders private, offer deletion after the event.
16. Definition of done
The product is complete when an organizer can: create a project, upload or design a template, import 1,000 participants, fix errors, map fields, preview and confirm, generate 1,000 unique PDFs, sign in with the chosen Gmail and see it as sender, write the email, start sending, close the browser, and later find that sending continued in quota-limited batches with every participant either Sent, Failed (with reason) or Skipped (with reason), no duplicates, a downloadable report, and working QR verification for every certificat