
function initTheme() {
  const savedTheme = localStorage.getItem('campusdesk_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('campusdesk_theme', newTheme);
  updateThemeToggleIcon(newTheme);
}

function updateThemeToggleIcon(theme) {
  const iconSpan = document.getElementById('theme-toggle-icon');
  if (iconSpan) {
    iconSpan.innerHTML = theme === 'light' 
      ? `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`
      : `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  }
}

function saveSession(token, user) {
  localStorage.setItem('campusdesk_token', token);
  localStorage.setItem('campusdesk_user', JSON.stringify(user));
}

function logout() {
  localStorage.removeItem('campusdesk_token');
  localStorage.removeItem('campusdesk_user');
  window.location.replace('/login');
}

function getToken() {
  return localStorage.getItem('campusdesk_token');
}

function getUser() {
  const userStr = localStorage.getItem('campusdesk_user');
  try {
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    return null;
  }
}

function checkAuthentication() {
  const token = getToken();
  const user = getUser();
  const currentPath = window.location.pathname;

  if (!token || !user) {
    if (currentPath !== '/login') {
      window.location.replace('/login');
    }
    return false;
  }

  if (currentPath === '/login') {
    window.location.replace('/resources');
    return false;
  }

  if (currentPath.startsWith('/admin') && user.role !== 'admin') {
    window.location.replace('/resources');
    return false;
  }

  return true;
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  
  options.headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
      console.warn('Unauthorized request detected. Logging out user...');
      logout();
      return null;
    }
    
    return response;
  } catch (error) {
    console.error('API Fetch failed:', error);
    throw error;
  }
}

function renderNavbar() {
  const user = getUser();
  if (!user) return;

  const currentPath = window.location.pathname;
  const navbarContainer = document.getElementById('navbar-container');
  if (!navbarContainer) return;

  const adminLink = user.role === 'admin' 
    ? `<li class="nav-item ${currentPath.startsWith('/admin') ? 'active' : ''}" onclick="window.location.href='/admin'">Admin Panel</li>`
    : '';

  navbarContainer.innerHTML = `
    <nav class="navbar">
      <div class="nav-brand" onclick="window.location.href='/'" style="cursor: pointer;">
        <img src="/images/logo.png" alt="LNMIIT Logo" style="height: 32px; object-fit: contain;">
        <span class="brand-text">CampusDesk</span>
      </div>
      
      <ul class="nav-links">
        <li class="nav-item ${currentPath.startsWith('/resources') ? 'active' : ''}" onclick="window.location.href='/resources'">Discover</li>
        <li class="nav-item ${currentPath === '/my-bookings' ? 'active' : ''}" onclick="window.location.href='/my-bookings'">My Bookings</li>
        ${adminLink}
      </ul>

      <div class="nav-profile">
        <button class="theme-toggle" onclick="toggleTheme()" title="Toggle Light/Dark Mode">
          <span id="theme-toggle-icon"></span>
        </button>
        <span style="font-weight: 700; font-size: 0.9rem; color: var(--app-text);">${user.name}</span>
        <button class="btn btn-secondary" onclick="logout()" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">Logout</button>
      </div>
    </nav>
  `;

  const savedTheme = localStorage.getItem('campusdesk_theme') || 'dark';
  updateThemeToggleIcon(savedTheme);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const isLoginPage = window.location.pathname === '/login';
  if (!isLoginPage) {
    const authenticated = checkAuthentication();
    if (authenticated) {
      renderNavbar();
    }
  } else {
    if (getToken() && getUser()) {
      window.location.replace('/resources');
    }
  }
});
