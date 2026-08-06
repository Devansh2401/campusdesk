const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const pad = (num) => String(num).padStart(2, '0');

function getLocalHHMM(isoString) {
  const d = new Date(isoString);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

let bookingLock = Promise.resolve();
function acquireLock() {
  let release;
  const nextLock = new Promise(resolve => {
    release = resolve;
  });
  const currentLock = bookingLock;
  bookingLock = bookingLock.then(() => nextLock);
  return currentLock.then(() => () => release());
}

router.post('/', async (req, res) => {
  const { resourceId, startTime, endTime, purpose } = req.body;
  const userId = req.user.userId;
  const userRole = req.user.role;

  let errors = {};
  if (!resourceId) errors.resourceId = 'Resource is required.';
  if (!startTime) errors.startTime = 'Start time is required.';
  if (!endTime) errors.endTime = 'End time is required.';
  if (!purpose || !purpose.trim()) errors.purpose = 'Booking purpose is required.';

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const now = new Date();
  const startD = new Date(startTime);
  const endD = new Date(endTime);

  if (isNaN(startD.getTime())) {
    return res.status(400).json({ errors: { startTime: 'Start time is an invalid date format.' } });
  }
  if (isNaN(endD.getTime())) {
    return res.status(400).json({ errors: { endTime: 'End time is an invalid date format.' } });
  }

  if (startD <= now) {
    return res.status(400).json({ errors: { startTime: 'Start time must be in the future.' } });
  }

  if (endD <= startD) {
    return res.status(400).json({ errors: { endTime: 'End time must be after the start time.' } });
  }

  const durationMs = endD - startD;
  const minDuration = 30 * 60 * 1000;
  const maxDuration = 4 * 60 * 60 * 1000;

  if (durationMs < minDuration || durationMs > maxDuration) {
    return res.status(400).json({
      errors: {
        endTime: 'Booking duration must be between 30 minutes and 4 hours.'
      }
    });
  }

  if (startD.toDateString() !== endD.toDateString()) {
    return res.status(400).json({
      errors: {
        endTime: 'Booking start and end times must be on the same calendar day.'
      }
    });
  }

  const release = await acquireLock();
  let db;
  try {
    db = await getDb();

    await db.exec('BEGIN IMMEDIATE TRANSACTION;');

    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND isActive = 1', [resourceId]);
    if (!resource) {
      await db.exec('ROLLBACK;');
      return res.status(400).json({ errors: { resourceId: 'Resource not found or is currently inactive.' } });
    }

    const bookingDay = startD.getDay(); 
    const availableDays = resource.availableDays ? resource.availableDays.split(',').map(Number) : [0, 1, 2, 3, 4, 5, 6];
    if (!availableDays.includes(bookingDay)) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      await db.exec('ROLLBACK;');
      return res.status(400).json({
        errors: {
          startTime: `Resource is closed on ${dayNames[bookingDay]}s.`
        }
      });
    }

    const bookingStartHHMM = getLocalHHMM(startTime);
    const bookingEndHHMM = getLocalHHMM(endTime);
    const shifts = resource.shifts ? resource.shifts.split(',') : ['09:00-21:00'];
    
    let inShift = false;
    for (const shift of shifts) {
      const [sOpen, sClose] = shift.split('-');
      if (bookingStartHHMM >= sOpen && bookingEndHHMM <= sClose) {
        inShift = true;
        break;
      }
    }

    if (!inShift) {
      await db.exec('ROLLBACK;');
      return res.status(400).json({
        errors: {
          startTime: `Booking must fall entirely within a single shift window (Operating shifts: ${resource.shifts}).`
        }
      });
    }

    if (userRole === 'student') {
      const activeBookingsCount = await db.get(
        `SELECT COUNT(*) as count FROM bookings 
         WHERE userId = ? AND resourceId = ? AND status = 'confirmed' AND endTime > ?`,
        [userId, resourceId, now.toISOString()]
      );

      if (activeBookingsCount && activeBookingsCount.count >= 2) {
        await db.exec('ROLLBACK;');
        return res.status(400).json({ 
          error: 'You can hold at most 2 upcoming confirmed bookings per resource.' 
        });
      }

      const dateCopy = new Date(startD);
      const day = dateCopy.getDay();
      const diffToMonday = dateCopy.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dateCopy.setDate(diffToMonday));
      monday.setHours(0, 0, 0, 0);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const weeklyBookingsCount = await db.get(
        `SELECT COUNT(*) as count FROM bookings 
         WHERE userId = ? AND status = 'confirmed' AND startTime >= ? AND startTime <= ?`,
        [userId, monday.toISOString(), sunday.toISOString()]
      );

      if (weeklyBookingsCount && weeklyBookingsCount.count >= 3) {
        await db.exec('ROLLBACK;');
        return res.status(400).json({ 
          error: 'You have reached the limit of 3 confirmed bookings for this calendar week.' 
        });
      }
    }

    const conflict = await db.get(
      `SELECT * FROM bookings 
       WHERE resourceId = ? AND status = 'confirmed' AND startTime < ? AND endTime > ?
       ORDER BY startTime ASC LIMIT 1`,
      [resourceId, endTime, startTime]
    );

    if (conflict) {
      await db.exec('ROLLBACK;');
      const clashingSlot = formatHumanReadable(conflict.startTime, conflict.endTime);
      return res.status(409).json({
        error: `Booking conflicts with an existing confirmed booking: ${clashingSlot}.`,
        conflict: {
          startTime: conflict.startTime,
          endTime: conflict.endTime
        }
      });
    }

    const defaultStatus = userRole === 'admin' ? 'confirmed' : 'pending';
    const result = await db.run(
      `INSERT INTO bookings (userId, resourceId, startTime, endTime, purpose, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, resourceId, startTime, endTime, purpose, defaultStatus]
    );

    await db.exec('COMMIT;');

    const newBooking = {
      id: result.lastID,
      userId,
      resourceId,
      startTime,
      endTime,
      purpose,
      status: defaultStatus,
      createdAt: new Date().toISOString()
    };

    return res.status(201).json(newBooking);

  } catch (error) {
    if (db) {
      try {
        await db.exec('ROLLBACK;');
      } catch (rbError) {
        console.error('Failed to rollback transaction:', rbError);
      }
    }
    console.error('Error creating booking:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    release();
  }
});

router.get('/me', async (req, res) => {
  const userId = req.user.userId;
  let { status, page, limit } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const db = await getDb();
    
    let queryConditions = ['b.userId = ?'];
    let queryParams = [userId];

    if (status && status !== 'all') {
      queryConditions.push('b.status = ?');
      queryParams.push(status);
    }

    const whereClause = `WHERE ${queryConditions.join(' AND ')}`;

    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM bookings b ${whereClause}`,
      queryParams
    );
    const total = countResult ? countResult.total : 0;

    const nowISO = new Date().toISOString();
    
    const data = await db.all(
      `SELECT b.id, b.startTime, b.endTime, b.purpose, b.status, b.createdAt,
              r.id as resourceId, r.name as resourceName, r.location as resourceLocation, r.category as resourceCategory
       FROM bookings b
       JOIN resources r ON b.resourceId = r.id
       ${whereClause}
       ORDER BY 
         CASE WHEN b.endTime > ? THEN 0 ELSE 1 END ASC,
         CASE WHEN b.endTime > ? THEN b.startTime END ASC,
         b.startTime DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, nowISO, nowISO, limit, offset]
    );

    return res.status(200).json({
      data,
      page,
      limit,
      total
    });

  } catch (error) {
    console.error('Error fetching user bookings:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  const userRole = req.user.role;

  try {
    const db = await getDb();

    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (userRole !== 'admin' && booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied: You can only cancel your own bookings.' });
    }

    const now = new Date();
    const bookingStart = new Date(booking.startTime);

    if (userRole !== 'admin' && bookingStart <= now) {
      return res.status(400).json({ error: 'Cannot cancel a booking that has already started.' });
    }

    await db.run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [id]);
    console.log(`Booking ID ${id} cancelled by user ID ${userId} (${userRole})`);

    return res.status(200).json({ 
      message: 'Booking cancelled successfully.',
      booking: { id, status: 'cancelled' }
    });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/:id/approve', async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required.' });
  }

  const release = await acquireLock();
  let db;

  try {
    db = await getDb();
    await db.exec('BEGIN IMMEDIATE TRANSACTION;');

    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) {
      await db.exec('ROLLBACK;');
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (booking.status !== 'pending') {
      await db.exec('ROLLBACK;');
      return res.status(400).json({ error: `Cannot approve booking with status "${booking.status}". Only pending bookings can be approved.` });
    }

    const conflict = await db.get(
      `SELECT * FROM bookings 
       WHERE resourceId = ? AND status = 'confirmed' AND startTime < ? AND endTime > ?
       ORDER BY startTime ASC LIMIT 1`,
      [booking.resourceId, booking.endTime, booking.startTime]
    );

    if (conflict) {
      await db.exec('ROLLBACK;');
      const clashingSlot = formatHumanReadable(conflict.startTime, conflict.endTime);
      return res.status(409).json({
        error: `Cannot approve. Slot conflicts with an already confirmed booking: ${clashingSlot}.`
      });
    }

    await db.run("UPDATE bookings SET status = 'confirmed' WHERE id = ?", [id]);
    await db.exec('COMMIT;');

    console.log(`Booking ID ${id} approved by admin.`);
    return res.status(200).json({ message: 'Booking approved successfully.', id, status: 'confirmed' });

  } catch (error) {
    if (db) {
      try { await db.exec('ROLLBACK;'); } catch (e) {}
    }
    console.error('Error approving booking:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  } finally {
    release();
  }
});

router.patch('/:id/reject', async (req, res) => {
  const { id } = req.params;
  const userRole = req.user.role;

  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin role required.' });
  }

  try {
    const db = await getDb();
    const booking = await db.get('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (booking.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject booking with status "${booking.status}". Only pending bookings can be rejected.` });
    }

    await db.run("UPDATE bookings SET status = 'rejected' WHERE id = ?", [id]);
    console.log(`Booking ID ${id} rejected by admin.`);
    
    return res.status(200).json({ message: 'Booking rejected successfully.', id, status: 'rejected' });
  } catch (error) {
    console.error('Error rejecting booking:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
