document.addEventListener('DOMContentLoaded', () => {
  const pathParts = window.location.pathname.split('/');
  const resourceId = pathParts[pathParts.length - 1];

  const globalError = document.getElementById('global-error');
  const formErrorBanner = document.getElementById('form-error-banner');
  
  const resName = document.getElementById('res-name');
  const resLocation = document.getElementById('res-location');
  const resCategory = document.getElementById('res-category');
  const resDescription = document.getElementById('res-description');
  const resHours = document.getElementById('res-hours');
  const resStatus = document.getElementById('res-status');
  
  const timelineDateInput = document.getElementById('timeline-date');
  const timelineLoading = document.getElementById('timeline-loading');
  const timelineGrid = document.getElementById('timeline-grid');
  
  const bookingForm = document.getElementById('booking-form');
  const bookingStartInput = document.getElementById('booking-start');
  const bookingEndInput = document.getElementById('booking-end');
  const bookingPurposeInput = document.getElementById('booking-purpose');
  const bookSubmitBtn = document.getElementById('book-submit-btn');
  
  const startError = document.getElementById('start-error');
  const endError = document.getElementById('end-error');
  const purposeError = document.getElementById('purpose-error');

  let resource = null;
  const today = new Date();
  const pad = (num) => String(num).padStart(2, '0');
  
  let selectedDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  
  timelineDateInput.value = selectedDate;
  const localDateTimeMin = `${selectedDate}T00:00`;
  bookingStartInput.min = localDateTimeMin;
  bookingEndInput.min = localDateTimeMin;

  const user = getUser(); 
  if (user) {
    bookSubmitBtn.textContent = user.role === 'admin' ? 'Confirm Booking' : 'Request Booking';
  }

  function format12Hour(timeStr) {
    const [hour, min] = timeStr.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${pad(min)} ${ampm}`;
  }

  async function fetchResourceDetails() {
    try {
      const response = await apiFetch(`/api/resources/${resourceId}`);
      if (!response) return;

      if (response.ok) {
        resource = await response.json();
        renderResourceInfo();
        fetchTimeline(); 
      } else {
        const errData = await response.json();
        showGlobalError(errData.error || 'Failed to load resource details.');
      }
    } catch (err) {
      console.error(err);
      showGlobalError('Failed to contact server.');
    }
  }

  function renderResourceInfo() {
    resName.textContent = resource.name;
    resLocation.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--app-primary); flex-shrink: 0; display: block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg> <span>${resource.location}</span>`;
    resCategory.className = `cd-badge cd-tag-${resource.category}`;
    resCategory.textContent = resource.category;
    resDescription.textContent = resource.description || 'No description provided.';
    
    const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activeDays = resource.availableDays ? resource.availableDays.split(',').map(Number) : [0,1,2,3,4,5,6];
    const operatingDaysText = activeDays.map(d => dayNamesShort[d]).join(', ');

    resHours.innerHTML = `
      <div><strong>Days:</strong> ${operatingDaysText}</div>
      <div style="margin-top: 0.25rem;"><strong>Shifts:</strong> ${resource.shifts.split(',').map(s => {
        const [o, c] = s.split('-');
        return `${format12Hour(o)}-${format12Hour(c)}`;
      }).join(', ')}</div>
    `;

    const now = new Date();
    const currentHHMM = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const currentDay = now.getDay();
    
    let isOpenRightNow = false;
    if (activeDays.includes(currentDay)) {
      const shifts = resource.shifts.split(',');
      isOpenRightNow = shifts.some(shift => {
        const [o, c] = shift.split('-');
        return currentHHMM >= o && currentHHMM <= c;
      });
    }
    
    resStatus.textContent = isOpenRightNow ? 'Open Now' : 'Closed';
    resStatus.style.color = isOpenRightNow ? 'var(--cd-state-avail)' : 'var(--lnm-txt-secondary)';
  }

  async function fetchTimeline() {
    if (!resource) return;

    timelineLoading.style.display = 'flex';
    timelineGrid.style.display = 'none';
    clearErrors();

    const [year, month, day] = selectedDate.split('-').map(Number);
    const selectedDayIndex = new Date(year, month - 1, day).getDay();
    const activeDays = resource.availableDays ? resource.availableDays.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6];

    if (!activeDays.includes(selectedDayIndex)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      timelineLoading.style.display = 'none';
      timelineGrid.style.display = 'none';
      
      showGlobalError(`Closed: This resource does not operate on ${dayNames[selectedDayIndex]}s. Please select a different date.`);
      
      bookingStartInput.disabled = true;
      bookingEndInput.disabled = true;
      bookingPurposeInput.disabled = true;
      bookSubmitBtn.disabled = true;
      bookSubmitBtn.textContent = 'Resource Closed';
      return;
    }

    bookingStartInput.disabled = false;
    bookingEndInput.disabled = false;
    bookingPurposeInput.disabled = false;
    bookSubmitBtn.disabled = false;
    bookSubmitBtn.textContent = user.role === 'admin' ? 'Confirm Booking' : 'Request Booking';

    try {
      const response = await apiFetch(`/api/resources/${resourceId}/bookings?date=${selectedDate}`);
      if (!response) return;

      const bookings = await response.json();

      if (response.ok) {
        renderTimelineSlots(bookings);
      } else {
        showGlobalError(bookings.error || 'Failed to load timeline bookings.');
      }
    } catch (err) {
      console.error(err);
      showGlobalError('Timeline load connection error.');
    } finally {
      timelineLoading.style.display = 'none';
    }
  }

  function renderTimelineSlots(confirmedBookings) {
    timelineGrid.innerHTML = '';
    timelineGrid.style.display = 'grid';

    const shiftsList = resource.shifts.split(',');
    let minHour = 24;
    let maxHour = 0;

    shiftsList.forEach(shift => {
      const [sOpen, sClose] = shift.split('-');
      const openH = parseInt(sOpen.split(':')[0]);
      const closeH = parseInt(sClose.split(':')[0]);
      if (openH < minHour) minHour = openH;
      if (closeH > maxHour) maxHour = closeH;
    });

    for (let hour = minHour; hour < maxHour; hour++) {
      const slotStartTimeStr = `${selectedDate}T${pad(hour)}:00:00`;
      const slotEndTimeStr = `${selectedDate}T${pad(hour + 1)}:00:00`;

      const slotStartD = new Date(slotStartTimeStr);
      const slotEndD = new Date(slotEndTimeStr);

      const slotStartHHMM = `${pad(hour)}:00`;
      const slotEndHHMM = `${pad(hour + 1)}:00`;
      
      const isSlotInShift = shiftsList.some(shift => {
        const [sOpen, sClose] = shift.split('-');
        return slotStartHHMM >= sOpen && slotEndHHMM <= sClose;
      });

      const slotEl = document.createElement('div');
      const start12 = format12Hour(`${pad(hour)}:00`);
      const end12 = format12Hour(`${pad(hour + 1)}:00`);
      const timeRangeText = `${start12} - ${end12}`;

      let statusClass = '';
      let statusBadge = '';

      if (!isSlotInShift) {
        statusClass = 'closed';
        statusBadge = 'Closed (Shift Break)';
      } else {
        const clashingBooking = confirmedBookings.find(b => {
          const bStart = new Date(b.startTime);
          const bEnd = new Date(b.endTime);
          return slotStartD < bEnd && slotEndD > bStart;
        });

        if (clashingBooking) {
          const isOwn = clashingBooking.userId === user.id;
          if (isOwn) {
            const isPending = clashingBooking.status === 'pending';
            statusClass = isPending ? 'own-pending' : 'own';
            statusBadge = isPending ? 'Pending (Your Booking)' : 'Your Booking';
          } else {
            statusClass = 'booked';
            statusBadge = `Booked (${clashingBooking.userName})`;
          }
        } else {
          statusClass = 'free';
          statusBadge = 'Available';
          
          slotEl.onclick = () => {
            bookingStartInput.value = `${selectedDate}T${pad(hour)}:00`;
            bookingEndInput.value = `${selectedDate}T${pad(hour + 1)}:00`;
            bookingStartInput.scrollIntoView({ behavior: 'smooth' });
            bookingStartInput.focus();
          };
        }
      }

      slotEl.className = `cd-time-capsule ${statusClass}`;
      slotEl.innerHTML = `
        <div class="slot-time-range">${timeRangeText}</div>
        <div class="slot-badge">${statusBadge}</div>
      `;

      timelineGrid.appendChild(slotEl);
    }
  }

  timelineDateInput.addEventListener('change', () => {
    selectedDate = timelineDateInput.value;
    fetchTimeline();
  });

  function clearErrors() {
    formErrorBanner.style.display = 'none';
    startError.style.display = 'none';
    endError.style.display = 'none';
    purposeError.style.display = 'none';
  }

  function showGlobalError(msg) {
    globalError.textContent = msg;
    globalError.style.display = 'block';
  }

  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const startVal = bookingStartInput.value;
    const endVal = bookingEndInput.value;
    const purpose = bookingPurposeInput.value.trim();

    if (!startVal || !endVal || !purpose) return;

    const startTimeISO = new Date(startVal).toISOString();
    const endTimeISO = new Date(endVal).toISOString();

    bookSubmitBtn.disabled = true;
    bookSubmitBtn.textContent = 'Reserving...';

    try {
      const response = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          resourceId: parseInt(resourceId),
          startTime: startTimeISO,
          endTime: endTimeISO,
          purpose
        })
      });

      if (!response) return; 

      const data = await response.json();

      if (response.status === 201) {
        window.location.href = '/my-bookings';
      } else if (response.status === 409) {
        formErrorBanner.textContent = data.error;
        formErrorBanner.style.display = 'block';
        
        fetchTimeline();
      } else if (response.status === 400) {
        if (data.errors) {
          if (data.errors.startTime) {
            startError.textContent = data.errors.startTime;
            startError.style.display = 'block';
          }
          if (data.errors.endTime) {
            endError.textContent = data.errors.endTime;
            endError.style.display = 'block';
          }
          if (data.errors.purpose) {
            purposeError.textContent = data.errors.purpose;
            purposeError.style.display = 'block';
          }
          if (data.errors.resourceId) {
            formErrorBanner.textContent = data.errors.resourceId;
            formErrorBanner.style.display = 'block';
          }
        } else if (data.error) {
          formErrorBanner.textContent = data.error;
          formErrorBanner.style.display = 'block';
        }
      } else {
        formErrorBanner.textContent = data.error || 'Server rejected booking request.';
        formErrorBanner.style.display = 'block';
      }
    } catch (err) {
      console.error(err);
      formErrorBanner.textContent = 'Failed to submit booking. Check connection.';
      formErrorBanner.style.display = 'block';
    } finally {
      bookSubmitBtn.disabled = false;
      bookSubmitBtn.textContent = user.role === 'admin' ? 'Confirm Booking' : 'Request Booking';
    }
  });

  fetchResourceDetails();
});
