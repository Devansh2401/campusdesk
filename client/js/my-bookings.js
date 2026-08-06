document.addEventListener('DOMContentLoaded', () => {
  const statusTabsContainer = document.getElementById('status-tabs-container');
  const bookingListContainer = document.getElementById('booking-list-container');
  const loadingContainer = document.getElementById('loading-container');
  const emptyContainer = document.getElementById('empty-container');
  const errorBanner = document.getElementById('error-banner');
  
  const paginationContainer = document.getElementById('pagination-container');
  const prevPageBtn = document.getElementById('prev-page-btn');
  const nextPageBtn = document.getElementById('next-page-btn');
  const pageInfo = document.getElementById('page-info');

  const user = getUser();
  if (user) {
    const greetingHeading = document.getElementById('user-greeting-heading');
    if (greetingHeading) {
      greetingHeading.innerHTML = `Welcome back, <i>${user.name}</i>`;
    }
  }

  let status = 'all';
  let page = 1;
  const limit = 5;
  let totalPages = 1;
  let bookingsData = []; 

  function formatHumanReadable(startStr, endStr) {
    const s = new Date(startStr);
    const e = new Date(endStr);
    
    const dateOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
    
    const dateFormatted = s.toLocaleDateString('en-US', dateOptions);
    const startFormatted = s.toLocaleTimeString('en-US', timeOptions);
    const endFormatted = e.toLocaleTimeString('en-US', timeOptions);
    
    return `${dateFormatted} at ${startFormatted} - ${endFormatted}`;
  }

  async function fetchBookings() {
    loadingContainer.style.display = 'flex';
    bookingListContainer.style.display = 'none';
    emptyContainer.style.display = 'none';
    errorBanner.style.display = 'none';
    paginationContainer.style.display = 'none';

    try {
      const response = await apiFetch(`/api/bookings/me?status=${status}&page=${page}&limit=${limit}`);
      if (!response) return; 

      const result = await response.json();

      if (response.ok) {
        bookingsData = result.data;
        renderBookingsList();
        setupPagination(result.total);
      } else {
        showError(result.error || 'Failed to fetch bookings.');
      }
    } catch (err) {
      console.error(err);
      showError('Failed to load bookings due to a network error.');
    } finally {
      loadingContainer.style.display = 'none';
    }
  }

  function renderBookingsList() {
    bookingListContainer.innerHTML = '';

    if (!bookingsData || bookingsData.length === 0) {
      emptyContainer.style.display = 'flex';
      return;
    }

    bookingListContainer.style.display = 'flex';

    bookingsData.forEach(booking => {
      const bookingItem = document.createElement('div');
      bookingItem.className = 'cd-booking-card';
      bookingItem.id = `cd-booking-card-${booking.id}`;

      const timeFormatted = formatHumanReadable(booking.startTime, booking.endTime);
      const now = new Date();
      const bookingStart = new Date(booking.startTime);
      
      const showCancelButton = (booking.status === 'confirmed' || booking.status === 'pending') && bookingStart > now;

      bookingItem.innerHTML = `
        <div class="booking-info">
          <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem;">
            <h3 class="booking-title">${booking.resourceName}</h3>
            <span class="cd-badge cd-tag-${booking.resourceCategory}">${booking.resourceCategory}</span>
          </div>
          <p style="color: var(--lnm-txt-secondary); font-size: 0.95rem; display: flex; align-items: center; gap: 0.45rem;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--app-primary); opacity: 0.85; flex-shrink: 0; display: block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> <span>${booking.resourceLocation}</span>
          </p>
          <p style="font-size: 0.9rem; margin-top: 0.25rem;">
            <strong>Scheduled:</strong> ${timeFormatted}
          </p>
          <p style="font-size: 0.9rem; color: var(--lnm-txt-secondary);">
            <strong>Purpose:</strong> "${booking.purpose}"
          </p>
          <div style="margin-top: 0.5rem;">
            <span class="booking-status status-${booking.status}">${booking.status}</span>
          </div>
        </div>
        
        <div class="booking-action" id="action-area-${booking.id}">
          ${showCancelButton ? `<button class="btn btn-secondary btn-danger-hover" id="cancel-btn-${booking.id}" style="font-size: 0.85rem; padding: 0.5rem 1rem;">Cancel Booking</button>` : ''}
        </div>
      `;

      bookingListContainer.appendChild(bookingItem);

      if (showCancelButton) {
        const cancelBtn = bookingItem.querySelector(`#cancel-btn-${booking.id}`);
        cancelBtn.onclick = () => performCancel(booking.id);
      }
    });
  }

  async function performCancel(bookingId) {
    clearError();

    const bookingIndex = bookingsData.findIndex(b => b.id === bookingId);
    if (bookingIndex === -1) return;

    const originalBooking = { ...bookingsData[bookingIndex] }; 
    
    bookingsData[bookingIndex].status = 'cancelled';

    renderBookingsList();

    console.log(`[OPTIMISTIC UPDATE] Booking ${bookingId} cancelled in UI, sending request...`);

    try {
      const response = await apiFetch(`/api/bookings/${bookingId}/cancel`, {
        method: 'PATCH'
      });

      if (!response) {
        return;
      }

      const result = await response.json();

      if (response.ok) {
        console.log(`[SUCCESS] Booking ${bookingId} successfully cancelled on server.`);
        fetchBookings(); 
      } else {
        console.warn(`[SERVER REJECTION] Booking ${bookingId} cancel failed:`, result.error);
        rollbackCancel(bookingId, originalBooking, result.error || 'Request rejected by server.');
      }
    } catch (err) {
      console.error(`[NETWORK ERROR] Failed to send cancel request for booking ${bookingId}:`, err);
      rollbackCancel(bookingId, originalBooking, 'Network error. Cancellation failed.');
    }
  }

  function rollbackCancel(bookingId, originalBooking, errorMsg) {
    const bookingIndex = bookingsData.findIndex(b => b.id === bookingId);
    if (bookingIndex !== -1) {
      bookingsData[bookingIndex] = originalBooking; 
      renderBookingsList(); 
    }
    showError(`Failed to cancel booking: ${errorMsg}`);
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

  statusTabsContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.bookings-tab');
    if (!tab) return;

    document.querySelectorAll('.bookings-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    status = tab.dataset.status;
    page = 1;
    fetchBookings();
  });

  prevPageBtn.addEventListener('click', () => {
    if (page > 1) {
      page -= 1;
      fetchBookings();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (page < totalPages) {
      page += 1;
      fetchBookings();
    }
  });

  function showError(msg) {
    errorBanner.textContent = msg;
    errorBanner.style.display = 'block';
  }

  function clearError() {
    errorBanner.style.display = 'none';
  }

  fetchBookings();
});
