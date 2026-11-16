import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Designer from './pages/Designer';
import Settings from './pages/Settings';
import ProjectWorkspace from './pages/ProjectWorkspace';
import VerifyCertificate from './pages/VerifyCertificate';
import NewProjectModal from './components/NewProjectModal';
import { api } from './services/api';

export default function App() {
  const isVerificationRoute = window.location.search.includes('id=') && window.location.search.includes('t=') || window.location.hash.includes('#/verify');
  if (isVerificationRoute) {
    return <VerifyCertificate />;
  }

  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState({
    email: '',
    quota: 0,
    kind: 'Personal Gmail'
  });
  const [toasts, setToasts] = useState([]);

  function showToast(message, isError = false) {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, isError }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }

  async function loadInitialData() {
    try {
      setLoading(true);
      const [u, sender, projectList] = await Promise.all([
        api.whoAmI().catch(() => ({ email: 'organizer@gmail.com' })),
        api.senderInfo().catch(() => ({ email: 'organizer@gmail.com', quota: 100, kind: 'Personal Gmail' })),
        api.listProjects().catch(() => [])
      ]);

      setCurrentUser({
        email: u?.email || sender?.email || 'organizer@gmail.com',
        quota: sender?.quota || 100,
        kind: sender?.kind || 'Personal Gmail'
      });
      setProjects(projectList || []);
    } catch (err) {
      console.error('Initialization error:', err);
      showToast('Could not reach backend services', true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadInitialData();
  }, []);

  async function handleProjectCreated(formData) {
    await api.createProject(formData);
    const updated = await api.listProjects();
    setProjects(updated || []);
  }

  async function handleDuplicateProject(projectId) {
    try {
      await api.duplicateProject(projectId);
      showToast('Project duplicated successfully');
      const updated = await api.listProjects();
      setProjects(updated || []);
    } catch (err) {
      showToast(err.message || 'Failed to duplicate project', true);
    }
  }

  async function handleDeleteProject(projectId, name) {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      await api.deleteProject(projectId);
      showToast('Project deleted');
      const updated = await api.listProjects();
      setProjects(updated || []);
      if (selectedProject?.project_id === projectId) {
        setSelectedProject(null);
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete project', true);
    }
  }

  return (
    <>
      <Sidebar 
        currentTab={selectedProject ? 'projects' : currentTab}
        setCurrentTab={tab => {
          setSelectedProject(null);
          setCurrentTab(tab);
        }}
        currentUser={currentUser}
      />

      <main className="app-main">
        {selectedProject ? (
          <ProjectWorkspace 
            project={selectedProject}
            onBack={() => setSelectedProject(null)}
            showToast={showToast}
          />
        ) : currentTab === 'dashboard' ? (
          <Dashboard
            projects={projects}
            loading={loading}
            onOpenNewProject={() => setIsNewProjectModalOpen(true)}
            onSelectProject={p => setSelectedProject(p)}
          />
        ) : currentTab === 'projects' ? (
          <Projects
            projects={projects}
            loading={loading}
            onOpenNewProject={() => setIsNewProjectModalOpen(true)}
            onSelectProject={p => setSelectedProject(p)}
            onDuplicateProject={handleDuplicateProject}
            onDeleteProject={handleDeleteProject}
          />
        ) : currentTab === 'designer' ? (
          <Designer showToast={showToast} />
        ) : (
          <Settings 
            currentUser={currentUser}
            showToast={showToast}
          />
        )}
      </main>

      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onProjectCreated={handleProjectCreated}
        showToast={showToast}
      />

      {/* Global Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.isError ? 'toast-error' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  );
}
