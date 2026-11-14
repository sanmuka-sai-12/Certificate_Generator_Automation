import React from 'react';
import { 
  Award, 
  LayoutDashboard, 
  FolderKanban, 
  Palette, 
  Settings as SettingsIcon,
  Mail,
  UserCheck
} from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, currentUser }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'designer', label: 'Designer & Templates', icon: Palette },
    { id: 'settings', label: 'Settings', icon: SettingsIcon }
  ];

  return (
    <aside className="app-sidebar">
      <div className="brand">
        <Award className="brand-icon" />
        <span>CertGen</span>
      </div>

      <ul className="nav-menu">
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <li key={item.id}>
              <button
                className={`nav-item-btn ${isActive ? 'active' : ''}`}
                onClick={() => setCurrentTab(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-user">
        <div className="user-email-text" title={currentUser.email}>
          {currentUser.email || 'Signing in...'}
        </div>
        <div className="user-quota-text">
          Quota: <b>{currentUser.quota}</b> remaining today
        </div>
      </div>
    </aside>
  );
}
