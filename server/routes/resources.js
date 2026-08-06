const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/query', async (req, res) => {
});

router.get('/', async (req, res) => {
  let { search, category, page, limit } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const db = await getDb();
    
    let queryConditions = ['isActive = 1'];
    let queryParams = [];

    if (search) {
      queryConditions.push('(name LIKE ? OR description LIKE ? OR location LIKE ?)');
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category && category !== 'all') {
      queryConditions.push('category = ?');
      queryParams.push(category);
    }

    const whereClause = queryConditions.length > 0 ? `WHERE ${queryConditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as total FROM resources ${whereClause}`;
    const countResult = await db.get(countQuery, queryParams);
    const total = countResult ? countResult.total : 0;

    const dataQuery = `SELECT * FROM resources ${whereClause} ORDER BY name ASC LIMIT ? OFFSET ?`;
    const dataParams = [...queryParams, limit, offset];
    const data = await db.all(dataQuery, dataParams);

    return res.status(200).json({
      data,
      page,
      limit,
      total
    });

  } catch (error) {
    console.error('Error fetching resources:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDb();
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND isActive = 1', [id]);

    if (!resource) {
      return res.status(404).json({ error: 'Resource not found or has been deleted.' });
    }

    return res.status(200).json(resource);
  } catch (error) {
    console.error('Error fetching resource detail:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:id/bookings', async (req, res) => {
  const { id } = req.params;
  const { date } = req.query; 

  if (!date) {
    return res.status(400).json({ error: 'Date query parameter (?date=YYYY-MM-DD) is required.' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format.' });
  }

  try {
    const db = await getDb();
    
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND isActive = 1', [id]);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found or inactive.' });
    }

    const bookings = await db.all(
      `SELECT b.id, b.userId, b.resourceId, b.startTime, b.endTime, b.purpose, b.status, u.name as userName, u.email as userEmail
       FROM bookings b
       JOIN users u ON b.userId = u.id
       WHERE b.resourceId = ? 
         AND (b.status = 'confirmed' OR (b.userId = ? AND b.status = 'pending'))
         AND b.startTime LIKE ?
       ORDER BY b.startTime ASC`,
      [id, req.user.userId, `${date}%`]
    );

    return res.status(200).json(bookings);
  } catch (error) {
    console.error('Error fetching day bookings:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/', adminMiddleware, async (req, res) => {
  const { name, description, location, category, openTime, closeTime, availableDays, shifts } = req.body;

  if (!name || !location || !category || !openTime || !closeTime) {
    return res.status(400).json({
      errors: {
        name: !name ? 'Resource name is required.' : null,
        location: !location ? 'Location is required.' : null,
        category: !category ? 'Category is required.' : null,
        openTime: !openTime ? 'Opening time is required.' : null,
        closeTime: !closeTime ? 'Closing time is required.' : null
      }
    });
  }

  const validCategories = ['hall', 'equipment', 'room', 'other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${validCategories.join(', ')}` });
  }

  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRegex.test(openTime) || !timeRegex.test(closeTime)) {
    return res.status(400).json({ error: 'Times must be in HH:MM format (24-hour style).' });
  }

  if (openTime >= closeTime) {
    return res.status(400).json({ error: 'Opening time must be strictly before closing time.' });
  }

  const finalAvailableDays = availableDays || '0,1,2,3,4,5,6';
  const availableDaysRegex = /^[0-6](,[0-6])*$/;
  if (!availableDaysRegex.test(finalAvailableDays)) {
    return res.status(400).json({ error: 'Available days must be a comma-separated list of day indices (0=Sun, 1=Mon, ..., 6=Sat).' });
  }

  const finalShifts = shifts ? shifts.replace(/\s+/g, '') : `${openTime}-${closeTime}`;
  const shiftsRegex = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d(,([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)*$/;
  if (!shiftsRegex.test(finalShifts)) {
    return res.status(400).json({ error: 'Shifts must be in format HH:MM-HH:MM (e.g. 09:00-12:00,18:00-21:00).' });
  }

  try {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO resources (name, description, location, category, openTime, closeTime, availableDays, shifts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || '', location, category, openTime, closeTime, finalAvailableDays, finalShifts]
    );

    const newResource = {
      id: result.lastID,
      name,
      description,
      location,
      category,
      openTime,
      closeTime,
      availableDays: finalAvailableDays,
      shifts: finalShifts,
      isActive: 1
    };

    return res.status(201).json(newResource);
  } catch (error) {
    console.error('Error creating resource:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.patch('/:id', adminMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description, location, category, openTime, closeTime, availableDays, shifts } = req.body;

  try {
    const db = await getDb();
    
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND isActive = 1', [id]);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    let updateFields = [];
    let params = [];

    if (name !== undefined) {
      if (!name) return res.status(400).json({ error: 'Resource name cannot be empty.' });
      updateFields.push('name = ?');
      params.push(name);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      params.push(description);
    }
    if (location !== undefined) {
      if (!location) return res.status(400).json({ error: 'Location cannot be empty.' });
      updateFields.push('location = ?');
      params.push(location);
    }
    if (category !== undefined) {
      const validCategories = ['hall', 'equipment', 'room', 'other'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ error: `Category must be one of: ${validCategories.join(', ')}` });
      }
      updateFields.push('category = ?');
      params.push(category);
    }
    
    const newOpenTime = openTime !== undefined ? openTime : resource.openTime;
    const newCloseTime = closeTime !== undefined ? closeTime : resource.closeTime;

    if (openTime !== undefined || closeTime !== undefined) {
      const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!timeRegex.test(newOpenTime) || !timeRegex.test(newCloseTime)) {
        return res.status(400).json({ error: 'Times must be in HH:MM format (24-hour style).' });
      }
      if (newOpenTime >= newCloseTime) {
        return res.status(400).json({ error: 'Opening time must be strictly before closing time.' });
      }
    }

    if (openTime !== undefined) {
      updateFields.push('openTime = ?');
      params.push(openTime);
    }
    if (closeTime !== undefined) {
      updateFields.push('closeTime = ?');
      params.push(closeTime);
    }

    if (availableDays !== undefined) {
      const availableDaysRegex = /^[0-6](,[0-6])*$/;
      if (!availableDaysRegex.test(availableDays)) {
        return res.status(400).json({ error: 'Available days must be a comma-separated list of day indices (0=Sun, 1=Mon, ..., 6=Sat).' });
      }
      updateFields.push('availableDays = ?');
      params.push(availableDays);
    }

    let finalShifts = shifts;
    if (shifts === undefined && (openTime !== undefined || closeTime !== undefined)) {
      if (resource.shifts === `${resource.openTime}-${resource.closeTime}`) {
        finalShifts = `${newOpenTime}-${newCloseTime}`;
      }
    }

    if (finalShifts !== undefined) {
      const cleanedShifts = finalShifts.replace(/\s+/g, '');
      const shiftsRegex = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d(,([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d)*$/;
      if (!shiftsRegex.test(cleanedShifts)) {
        return res.status(400).json({ error: 'Shifts must be in format HH:MM-HH:MM (e.g. 09:00-12:00,18:00-21:00).' });
      }
      updateFields.push('shifts = ?');
      params.push(cleanedShifts);
    }

    if (updateFields.length === 0) {
      return res.status(200).json(resource);
    }

    params.push(id);
    const updateQuery = `UPDATE resources SET ${updateFields.join(', ')} WHERE id = ?`;
    await db.run(updateQuery, params);

    const updatedResource = await db.get('SELECT * FROM resources WHERE id = ?', [id]);
    return res.status(200).json(updatedResource);

  } catch (error) {
    console.error('Error updating resource:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/:id', adminMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const db = await getDb();
    
    const resource = await db.get('SELECT * FROM resources WHERE id = ? AND isActive = 1', [id]);
    if (!resource) {
      return res.status(404).json({ error: 'Resource not found.' });
    }

    await db.run('UPDATE resources SET isActive = 0 WHERE id = ?', [id]);
    console.log(`Soft deleted resource ID: ${id} (${resource.name})`);

    const currentTime = new Date().toISOString();
    await db.run(
      `UPDATE bookings SET status = 'cancelled' 
       WHERE resourceId = ? AND status = 'confirmed' AND startTime > ?`,
      [id, currentTime]
    );

    return res.status(200).json({ message: 'Resource successfully deleted and associated future bookings cancelled.' });

  } catch (error) {
    console.error('Error deleting resource:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
