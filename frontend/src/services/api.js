/**
 * Google Apps Script API Bridge
 * In production (Apps Script), communicates via google.script.run
 * In local dev (Vite), provides interactive mock persistence via localStorage
 */

const LOCAL_STORAGE_KEY_PROJECTS = 'certgen_mock_projects';
const LOCAL_STORAGE_KEY_TEMPLATES = 'certgen_mock_templates';

function getLocalProjects() {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PROJECTS);
    return raw ? JSON.parse(raw) : [
      {
        project_id: 'p101',
        name: 'National AI Hackathon 2026',
        organization: 'National Institute of Technology',
        event_name: 'HackAI 2026',
        event_date: '2026-11-20',
        cert_type: 'Achievement',
        status: 'draft',
        created_at: new Date().toISOString()
      }
    ];
  } catch {
    return [];
  }
}

function saveLocalProjects(projects) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PROJECTS, JSON.stringify(projects));
  } catch (e) {
    console.error(e);
  }
}

export const api = new Proxy({}, {
  get: (_, fn) => (...args) => new Promise((resolve, reject) => {
    // Check if running inside Google Apps Script iframe
    if (typeof window !== 'undefined' && window.google?.script?.run) {
      window.google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(err => {
          const msg = (err && err.message) ? err.message : String(err || 'Server error occurred');
          reject(new Error(msg));
        })
        [fn](...args);
    } else {
      // Local development mock environment
      console.log(`[Dev Mock API Call] -> ${fn}(`, ...args, `)`);
      setTimeout(() => {
        try {
          if (fn === 'whoAmI') {
            resolve({ email: 'developer@example.com' });
          } else if (fn === 'senderInfo') {
            resolve({
              email: 'developer@example.com',
              quota: 100,
              kind: 'Personal Gmail (~100/day)'
            });
          } else if (fn === 'listProjects') {
            resolve(getLocalProjects());
          } else if (fn === 'createProject') {
            const p = args[0] || {};
            const id = 'p_' + Math.random().toString(36).substring(2, 8);
            const projects = getLocalProjects();
            const newProj = {
              project_id: id,
              name: p.name || 'Untitled Project',
              organization: p.organization || '',
              event_name: p.event_name || '',
              event_date: p.event_date || '',
              cert_type: p.cert_type || 'Participation',
              template_id: '',
              sheetId: 'sheet_' + id,
              folderId: 'folder_' + id,
              sender_email: 'developer@example.com',
              status: 'draft',
              created_at: new Date().toISOString()
            };
            projects.unshift(newProj);
            saveLocalProjects(projects);
            resolve({ projectId: id });
          } else if (fn === 'deleteProject') {
            const pid = args[0];
            const filtered = getLocalProjects().filter(p => p.project_id !== pid);
            saveLocalProjects(filtered);
            resolve({ ok: true });
          } else if (fn === 'duplicateProject') {
            const pid = args[0];
            const projects = getLocalProjects();
            const target = projects.find(p => p.project_id === pid);
            if (target) {
              const dupId = 'p_' + Math.random().toString(36).substring(2, 8);
              projects.unshift({
                ...target,
                project_id: dupId,
                name: `${target.name} (Copy)`,
                created_at: new Date().toISOString()
              });
              saveLocalProjects(projects);
              resolve({ projectId: dupId });
            } else {
              reject(new Error('Project not found'));
            }
          } else {
            resolve({ ok: true });
          }
        } catch (e) {
          reject(e);
        }
      }, 150);
    }
  })
});
