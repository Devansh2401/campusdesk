document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  const categoryFilterContainer = document.getElementById('category-filter-container');
  
  const resourcesGrid = document.getElementById('resources-grid-container');
  const loadingContainer = document.getElementById('loading-container');
  const emptyContainer = document.getElementById('empty-container');
  const errorBanner = document.getElementById('error-banner');
  
  const paginationContainer = document.getElementById('pagination-container');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');
  const pageInfo = document.getElementById('page-info');

  let search = '';
  let category = 'all';
  let page = 1;
  const limit = 6;
  let totalPages = 1;
  let debounceTimeout = null;

  function format12Hour(timeStr) {
    const [hour, min] = timeStr.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${String(min).padStart(2, '0')} ${ampm}`;
  }

  function isResourceOpen(openTime, closeTime) {
    const now = new Date();
    const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentHHMM >= openTime && currentHHMM <= closeTime;
  }

  async function fetchResources() {
    loadingContainer.style.display = 'flex';
    resourcesGrid.style.display = 'none';
    emptyContainer.style.display = 'none';
    errorBanner.style.display = 'none';
    paginationContainer.style.display = 'none';

    try {
      const queryParams = new URLSearchParams({
        search,
        category,
        page,
        limit
      });

      const response = await apiFetch(`/api/resources?${queryParams.toString()}`);
      if (!response) return; 

      const result = await response.json();

      if (response.ok) {
        renderResourcesList(result.data);
        setupPagination(result.total);
      } else {
        errorBanner.textContent = result.error || 'Failed to fetch resources.';
        errorBanner.style.display = 'block';
      }
    } catch (err) {
      console.error(err);
      errorBanner.textContent = 'Failed to load resources due to a connection error.';
      errorBanner.style.display = 'block';
    } finally {
      loadingContainer.style.display = 'none';
    }
  }

  function renderResourcesList(resources) {
    resourcesGrid.innerHTML = '';

    if (!resources || resources.length === 0) {
      emptyContainer.style.display = 'flex';
      return;
    }

    resourcesGrid.style.display = 'grid';

    resources.forEach(res => {
      const open = isResourceOpen(res.openTime, res.closeTime);
      const openFormatted = format12Hour(res.openTime);
      const closeFormatted = format12Hour(res.closeTime);
      
      const card = document.createElement('div');
      card.className = 'cd-space-card';
      card.onclick = () => window.location.href = `/resources/${res.id}`;

      card.innerHTML = `
        <div class="resource-header">
          <h2 class="resource-title">${res.name}</h2>
          <span class="cd-badge cd-tag-${res.category}">${res.category}</span>
        </div>
        <p class="resource-description">${res.description || 'No description provided.'}</p>
        <div class="resource-meta">
          <div class="meta-item">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--app-primary); flex-shrink: 0; display: block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> <span>${res.location}</span>
          </div>
          <div class="meta-item">
            <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--app-primary); flex-shrink: 0; display: block;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> <span>${openFormatted} - ${closeFormatted}</span>
          </div>
          <div class="meta-item" style="margin-top: 0.25rem;">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${open ? 'var(--cd-state-avail)' : 'var(--lnm-txt-muted)'}; margin-right: 0.25rem;"></span>
            <span style="font-weight: 600; color:${open ? 'var(--cd-state-avail)' : 'var(--lnm-txt-secondary)'};">
              ${open ? 'Open' : 'Closed'}
            </span>
          </div>
        </div>
      `;

      resourcesGrid.appendChild(card);
    });
  }

  function setupPagination(totalItems) {
    totalPages = Math.ceil(totalItems / limit) || 1;
    
    if (totalPages <= 1) {
      paginationContainer.style.display = 'none';
      return;
    }

    paginationContainer.style.display = 'flex';
    pageInfo.textContent = `Page ${page} of ${totalPages}`;
    
    prevPageBtn.disabled = page === 1;
    nextPageBtn.disabled = page === totalPages;
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      search = searchInput.value.trim();
      page = 1;
      fetchResources();
    }, 400); 
  });

  categoryFilterContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.category-tab');
    if (!tab) return;

    document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    category = tab.dataset.category;
    page = 1;
    fetchResources();
  });

  prevPageBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      fetchResources();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (page < totalPages) {
      page += 1;
      fetchResources();
    }
  });

  fetchResources();
});
