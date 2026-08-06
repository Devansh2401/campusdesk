document.addEventListener('DOMContentLoaded', () => {
  const user = getUser();
  if (!user || user.role !== 'admin') {
    window.location.replace('/resources');
    return;
  }

  const adminError = document.getElementById('admin-error');
  const adminSuccess = document.getElementById('admin-success');
  
  const formTitle = document.getElementById('form-title');
  const resourceForm = document.getElementById('resource-form');
  const resNameInput = document.getElementById('res-name-input');
  const resLocationInput = document.getElementById('res-location-input');
  const resCategorySelect = document.getElementById('res-category-select');
  const resOpenInput = document.getElementById('res-open-input');
  const resCloseInput = document.getElementById('res-close-input');
  const resShiftsInput = document.getElementById('res-shifts-input');
  const resDescInput = document.getElementById('res-desc-input');
  const resSaveBtn = document.getElementById('res-save-btn');
  const resClearBtn = document.getElementById('res-clear-btn');
  
  const resourcesTableBody = document.getElementById('resources-table-body');
  
  const filterResource = document.getElementById('filter-resource');
  const filterStatus = document.getElementById('filter-status');
  const filterDate = document.getElementById('filter-date');
  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  const purgeBookingsBtn = document.getElementById('purge-bookings-btn');
  
  const bookingsLoading = document.getElementById('bookings-loading');
  const bookingsTableContainer = document.getElementById('bookings-table-container');
  const bookingsTableBody = document.getElementById('bookings-table-body');
  const bookingsEmpty = document.getElementById('bookings-empty');
  
  const bookingsPagination = document.getElementById('bookings-pagination');
  const bookingsPrevBtn = document.getElementById('bookings-prev-btn');
  const bookingsNextBtn = document.getElementById('bookings-next-btn');
  const bookingsPageInfo = document.getElementById('bookings-page-info');

  let resourcesDirectoryList = [];
  let editResourceId = null;
  
  let filterResVal = '';
  let filterStatusVal = 'all';
  let filterDateVal = '';
  let bookingPage = 1;
  const bookingLimit = 8;
  let bookingTotalPages = 1;

  function formatHumanReadable(startStr, endStr) {
    const s = new Date(startStr);
    const e = new Date(endStr);
    
    const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
    
    const dateFormatted = s.toLocaleDateString('en-US', dateOptions);
    const startFormatted = s.toLocaleTimeString('en-US', timeOptions);
    const endFormatted = e.toLocaleTimeString('en-US', timeOptions);
    
    return `${dateFormatted} (${startFormatted} - ${endFormatted})`;
  }

  function format12Hour(timeStr) {
    const [hour, min] = timeStr.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${String(min).padStart(2, '0')} ${ampm}`;
  }

  function showError(msg) {
    adminError.textContent = msg;
    adminError.style.display = 'block';
    adminSuccess.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showSuccess(msg) {
    adminSuccess.textContent = msg;
    adminSuccess.style.display = 'block';
    adminError.style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      adminSuccess.style.display = 'none';
    }, 4000);
  }

  function clearAlerts() {
    adminError.style.display = 'none';
    adminSuccess.style.display = 'none';
  }

  async function fetchResourcesDirectory() {
    try {
      const response = await apiFetch('/api/resources?limit=100');
      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        resourcesDirectoryList = result.data;
        renderResourcesDirectoryTable();
        populateResourceFilterDropdown();
      } else {
        showError(result.error || 'Failed to retrieve resources list.');
      }
    } catch (err) {
      console.error(err);
      showError('Resources load connection error.');
    }
  }

  function renderResourcesDirectoryTable() {
    resourcesTableBody.innerHTML = '';
    
    if (resourcesDirectoryList.length === 0) {
      resourcesTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--lnm-txt-secondary);">No active resources in database.</td></tr>`;
      return;
    }

    resourcesDirectoryList.forEach(res => {
      const tr = document.createElement('tr');
      
      const hoursFormatted = `${format12Hour(res.openTime)} - ${format12Hour(res.closeTime)}`;

      tr.innerHTML = `
        <td>
          <strong style="color: var(--lnm-txt-primary); font-size: 0.95rem;">${res.name}</strong><br>
          <span style="color: var(--lnm-txt-secondary); font-size: 0.75rem;">${hoursFormatted}</span>
        </td>
        <td>
          <span class="cd-badge cd-tag-${res.category}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">${res.category}</span>
        </td>
        <td>${res.location}</td>
        <td>
          <div style="display: flex; gap: 0.4rem;">
            <button class="btn btn-secondary" onclick="editResource(${res.id})" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
            <button class="btn btn-secondary btn-danger-hover" onclick="deleteResource(${res.id})" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--cd-state-closed);">Delete</button>
          </div>
        </td>
      `;
      resourcesTableBody.appendChild(tr);
    });
  }

  function populateResourceFilterDropdown() {
    const currentVal = filterResource.value;
    filterResource.innerHTML = '<option value="">All Resources</option>';
    
    resourcesDirectoryList.forEach(res => {
      const opt = document.createElement('option');
      opt.value = res.id;
      opt.textContent = res.name;
      filterResource.appendChild(opt);
    });

    filterResource.value = currentVal;
  }

  resourceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlerts();

    const name = resNameInput.value.trim();
    const location = resLocationInput.value.trim();
    const category = resCategorySelect.value;
    const openTime = resOpenInput.value.trim();
    const closeTime = resCloseInput.value.trim();
    const description = resDescInput.value.trim();

    const availableDays = Array.from(document.querySelectorAll('input[name="res-day"]:checked'))
      .map(cb => cb.value)
      .join(',');

    const shifts = resShiftsInput.value.trim();

    if (!name || !location || !category || !openTime || !closeTime) return;

    if (!availableDays) {
      showError('Please check at least one operating day.');
      return;
    }

    const isEdit = editResourceId !== null;
    const url = isEdit ? `/api/resources/${editResourceId}` : '/api/resources';
    const method = isEdit ? 'PATCH' : 'POST';

    resSaveBtn.disabled = true;
    resSaveBtn.textContent = 'Saving...';

    try {
      const response = await apiFetch(url, {
        method,
        body: JSON.stringify({ 
          name, 
          location, 
          category, 
          openTime, 
          closeTime, 
          description,
          availableDays,
          shifts: shifts || undefined 
        })
      });

      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        showSuccess(isEdit ? `Resource "${name}" updated successfully.` : `Resource "${name}" added successfully.`);
        resetResourceForm();
        fetchResourcesDirectory();
        fetchBookingsSupervision(); 
      } else {
        showError(result.error || 'Failed to save resource.');
      }
    } catch (err) {
      console.error(err);
      showError('Connection error. Failed to save.');
    } finally {
      resSaveBtn.disabled = false;
      resSaveBtn.textContent = isEdit ? 'Update Resource' : 'Save Resource';
    }
  });

  window.editResource = function(id) {
    clearAlerts();
    const res = resourcesDirectoryList.find(r => r.id === id);
    if (!res) return;

    editResourceId = res.id;
    resNameInput.value = res.name;
    resLocationInput.value = res.location;
    resCategorySelect.value = res.category;
    resOpenInput.value = res.openTime;
    resCloseInput.value = res.closeTime;
    resDescInput.value = res.description || '';
    
    const activeDays = res.availableDays ? res.availableDays.split(',') : [];
    document.querySelectorAll('input[name="res-day"]').forEach(cb => {
      cb.checked = activeDays.includes(cb.value);
    });

    resShiftsInput.value = res.shifts || '';

    formTitle.textContent = `Edit Resource: ${res.name}`;
    resSaveBtn.textContent = 'Update Resource';
  };

  window.deleteResource = async function(id) {
    clearAlerts();
    const res = resourcesDirectoryList.find(r => r.id === id);
    if (!res) return;

    const confirmDelete = confirm(`Are you sure you want to delete "${res.name}"? This soft-deletes the resource and cancels all future confirmed bookings.`);
    if (!confirmDelete) return;

    try {
      const response = await apiFetch(`/api/resources/${id}`, {
        method: 'DELETE'
      });

      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        showSuccess(`Resource "${res.name}" has been deleted.`);
        if (editResourceId === id) resetResourceForm();
        fetchResourcesDirectory();
        fetchBookingsSupervision();
      } else {
        showError(result.error || 'Failed to delete resource.');
      }
    } catch (err) {
      console.error(err);
      showError('Connection error during deletion.');
    }
  };

  function resetResourceForm() {
    resourceForm.reset();
    editResourceId = null;
    formTitle.textContent = 'Add New Resource';
    resSaveBtn.textContent = 'Save Resource';
    
    document.querySelectorAll('input[name="res-day"]').forEach(cb => {
      cb.checked = cb.value !== '0';
    });

    resShiftsInput.value = '';
  }

  resClearBtn.addEventListener('click', () => {
    clearAlerts();
    resetResourceForm();
  });

  async function fetchBookingsSupervision() {
    bookingsLoading.style.display = 'flex';
    bookingsTableContainer.style.display = 'none';
    bookingsEmpty.style.display = 'none';
    bookingsPagination.style.display = 'none';

    try {
      const queryParams = new URLSearchParams({
        resourceId: filterResVal,
        status: filterStatusVal,
        date: filterDateVal,
        page: bookingPage,
        limit: bookingLimit
      });

      const response = await apiFetch(`/api/admin/bookings?${queryParams.toString()}`);
      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        renderBookingsOversightTable(result.data);
        setupBookingsPagination(result.total);
      } else {
        showError(result.error || 'Failed to supervise bookings.');
      }
    } catch (err) {
      console.error(err);
      showError('Oversight load connection error.');
    } finally {
      bookingsLoading.style.display = 'none';
    }
  }

  function renderBookingsOversightTable(bookings) {
    bookingsTableBody.innerHTML = '';

    if (!bookings || bookings.length === 0) {
      bookingsEmpty.style.display = 'flex';
      return;
    }

    bookingsTableContainer.style.display = 'block';

    bookings.forEach(b => {
      const tr = document.createElement('tr');
      const timeFormatted = formatHumanReadable(b.startTime, b.endTime);
      
      let actionHtml = '—';
      if (b.status === 'confirmed') {
        actionHtml = `<button class="btn btn-secondary btn-danger-hover" onclick="adminCancelBooking(${b.id})" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--cd-state-closed);">Cancel</button>`;
      } else if (b.status === 'pending') {
        actionHtml = `
          <div style="display: flex; gap: 0.3rem;">
            <button class="btn btn-primary" onclick="adminApproveBooking(${b.id})" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; background-color: var(--cd-state-avail); border-color: var(--cd-state-avail);">Approve</button>
            <button class="btn btn-secondary btn-danger-hover" onclick="adminRejectBooking(${b.id})" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--cd-state-closed);">Reject</button>
          </div>
        `;
      }

      tr.innerHTML = `
        <td>
          <strong style="color: var(--lnm-txt-primary);">${b.resourceName}</strong>
        </td>
        <td>
          <strong>${b.userName}</strong><br>
          <span style="color: var(--lnm-txt-secondary); font-size: 0.75rem;">${b.userEmail}</span>
        </td>
        <td>
          <span style="font-weight: 500;">${timeFormatted}</span><br>
          <span style="color: var(--lnm-txt-secondary); font-style: italic;">"${b.purpose}"</span>
        </td>
        <td>
          <span class="booking-status status-${b.status}" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">${b.status}</span>
        </td>
        <td>
          ${actionHtml}
        </td>
      `;

      bookingsTableBody.appendChild(tr);
    });
  }

  window.adminApproveBooking = async function(bookingId) {
    clearAlerts();
    try {
      const response = await apiFetch(`/api/bookings/${bookingId}/approve`, {
        method: 'PATCH'
      });

      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        showSuccess(`Booking ID #${bookingId} has been successfully approved and confirmed.`);
        fetchBookingsSupervision();
      } else {
        showError(result.error || 'Failed to approve booking.');
      }
    } catch (err) {
      console.error(err);
      showError('Connection error during booking approval.');
    }
  };

  window.adminRejectBooking = async function(bookingId) {
    clearAlerts();
    const confirmReject = confirm('Are you sure you want to reject this booking request?');
    if (!confirmReject) return;

    try {
      const response = await apiFetch(`/api/bookings/${bookingId}/reject`, {
        method: 'PATCH'
      });

      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        showSuccess(`Booking ID #${bookingId} has been rejected.`);
        fetchBookingsSupervision();
      } else {
        showError(result.error || 'Failed to reject booking.');
      }
    } catch (err) {
      console.error(err);
      showError('Connection error during booking rejection.');
    }
  };

  window.adminCancelBooking = async function(bookingId) {
    clearAlerts();
    const confirmCancel = confirm('Are you sure you want to cancel this booking? This override cannot be undone.');
    if (!confirmCancel) return;

    try {
      const response = await apiFetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PATCH'
      });

      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        showSuccess(`Booking ID #${bookingId} has been successfully cancelled.`);
        fetchBookingsSupervision();
      } else {
        showError(result.error || 'Failed to cancel booking.');
      }
    } catch (err) {
      console.error(err);
      showError('Connection error during booking cancellation.');
    }
  };

  function setupBookingsPagination(totalItems) {
    bookingTotalPages = Math.ceil(totalItems / bookingLimit) || 1;

    if (bookingTotalPages <= 1) {
      bookingsPagination.style.display = 'none';
      return;
    }

    bookingsPagination.style.display = 'flex';
    bookingsPageInfo.textContent = `Page ${bookingPage} of ${bookingTotalPages}`;
    
    bookingsPrevBtn.disabled = bookingPage === 1;
    bookingsNextBtn.disabled = bookingPage === bookingTotalPages;
  }

  filterResource.addEventListener('change', () => {
    filterResVal = filterResource.value;
    bookingPage = 1;
    fetchBookingsSupervision();
  });

  filterStatus.addEventListener('change', () => {
    filterStatusVal = filterStatus.value;
    bookingPage = 1;
    fetchBookingsSupervision();
  });

  filterDate.addEventListener('change', () => {
    filterDateVal = filterDate.value;
    bookingPage = 1;
    fetchBookingsSupervision();
  });

  clearFiltersBtn.addEventListener('click', () => {
    filterResource.value = '';
    filterStatus.value = 'all';
    filterDate.value = '';

    filterResVal = '';
    filterStatusVal = 'all';
    filterDateVal = '';
    bookingPage = 1;
    
    clearAlerts();
    fetchBookingsSupervision();
  });

  purgeBookingsBtn.addEventListener('click', async () => {
    clearAlerts();
    const confirmPurge = confirm('Are you sure you want to permanently clear/delete all Cancelled and Rejected bookings from the system?');
    if (!confirmPurge) return;

    try {
      const response = await apiFetch('/api/admin/bookings/purge', {
        method: 'DELETE'
      });

      if (!response) return;

      const result = await response.json();

      if (response.ok) {
        showSuccess('All Cancelled and Rejected bookings have been purged.');
        bookingPage = 1;
        fetchBookingsSupervision();
      } else {
        showError(result.error || 'Failed to purge bookings.');
      }
    } catch (err) {
      console.error(err);
      showError('Purge connection error.');
    }
  });

  bookingsPrevBtn.addEventListener('click', () => {
    if (bookingPage > 1) {
      bookingPage -= 1;
      fetchBookingsSupervision();
    }
  });

  bookingsNextBtn.addEventListener('click', () => {
    if (bookingPage < bookingTotalPages) {
      bookingPage += 1;
      fetchBookingsSupervision();
    }
  });

  fetchResourcesDirectory();
  fetchBookingsSupervision();
});
