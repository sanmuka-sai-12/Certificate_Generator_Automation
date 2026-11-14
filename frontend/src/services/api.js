/**
 * FastAPI REST API Client
 * Connects to http://localhost:8000/api/v1 with graceful local fallback
 */

const API_BASE = 'http://localhost:8000/api/v1';

async function request(path, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'API request failed');
    }
    return await res.json();
  } catch (err) {
    console.warn(`[FastAPI Request Error on ${path}]:`, err.message);
    throw err;
  }
}

export const api = {
  // Auth & Senders
  whoAmI: async () => {
    return { email: 'organizer@gmail.com' };
  },
  
  senderInfo: async () => {
    try {
      const accounts = await request('/auth/accounts');
      if (accounts && accounts.length > 0) {
        return {
          email: accounts[0].sender_email,
          quota: accounts[0].daily_quota_limit,
          kind: accounts[0].account_type === 'workspace' ? 'Google Workspace (~1,500/day)' : 'Personal Gmail (~100/day)'
        };
      }
    } catch {}
    return { email: 'organizer@gmail.com', quota: 100, kind: 'Personal Gmail (~100/day)' };
  },
  
  getGoogleAuthUrl: async () => {
    return await request('/auth/google/url');
  },

  // Projects
  listProjects: async () => {
    try {
      return await request('/projects');
    } catch {
      // Local fallback
      const raw = localStorage.getItem('certgen_mock_projects');
      return raw ? JSON.parse(raw) : [];
    }
  },

  createProject: async (projectData) => {
    try {
      return await request('/projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });
    } catch (e) {
      // Local fallback
      const projects = JSON.parse(localStorage.getItem('certgen_mock_projects') || '[]');
      const newP = {
        id: 'p_' + Math.random().toString(36).substring(2, 8),
        ...projectData,
        status: 'draft',
        created_at: new Date().toISOString()
      };
      projects.unshift(newP);
      localStorage.setItem('certgen_mock_projects', JSON.stringify(projects));
      return newP;
    }
  },

  duplicateProject: async (projectId) => {
    return await request(`/projects/${projectId}/duplicate`, { method: 'POST' });
  },

  deleteProject: async (projectId) => {
    return await request(`/projects/${projectId}`, { method: 'DELETE' });
  },

  // Participants
  saveParticipants: async (projectId, list) => {
    return await request(`/participants/${projectId}/import`, {
      method: 'POST',
      body: JSON.stringify({
        participants: list.map(p => ({
          name: p.name,
          email: p.email,
          cert_type: p.cert_type,
          college: p.college,
          department: p.department,
          reg_no: p.reg_no,
          position: p.position
        }))
      })
    });
  },

  getParticipants: async (projectId) => {
    return await request(`/participants/${projectId}`);
  },

  getParticipantStats: async (projectId) => {
    return await request(`/participants/${projectId}/stats`);
  },

  // Templates
  saveTemplate: async (tpl) => {
    return await request('/templates', {
      method: 'POST',
      body: JSON.stringify(tpl)
    });
  },

  listTemplates: async () => {
    return await request('/templates');
  },

  // Emails & Dispatch
  sendTest: async (projectId, recipientEmail) => {
    return await request('/emails/test', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        recipient_email: recipientEmail || 'organizer@gmail.com'
      })
    });
  },

  startBatchSending: async (projectId, batchSize = 50) => {
    return await request('/emails/batch', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        batch_size: batchSize
      })
    });
  },

  getSendingProgress: async (projectId) => {
    return await request(`/emails/progress/${projectId}`);
  }
};
