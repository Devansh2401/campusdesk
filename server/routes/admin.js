const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/bookings', async (req, res) => {
  let { resourceId, status, date, page, limit } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const db = await getDb();

    let queryConditions = [];
    let queryParams = [];

    if (resourceId) {
      queryConditions.push('b.resourceId = ?');
      queryParams.push(resourceId);
    }

    if (status && status !== 'all') {
      queryConditions.push('b.status = ?');
      queryParams.push(status);
    }

    if (date) {
      queryConditions.push('b.startTime LIKE ?');
      queryParams.push(`${date}%`);
    }

    const whereClause = queryConditions.length > 0 ? `WHERE ${queryConditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) as total 
      FROM bookings b
      ${whereClause}
    `;
    const countResult = await db.get(countQuery, queryParams);
    const total = countResult ? countResult.total : 0;

    const dataQuery = `
      SELECT b.id, b.startTime, b.endTime, b.purpose, b.status, b.createdAt,
             u.id as userId, u.name as userName, u.email as userEmail,
             r.id as resourceId, r.name as resourceName, r.location as resourceLocation, r.category as resourceCategory
      FROM bookings b
      JOIN users u ON b.userId = u.id
      JOIN resources r ON b.resourceId = r.id
      ${whereClause}
      ORDER BY b.startTime DESC
      LIMIT ? OFFSET ?
    `;
    
    const data = await db.all(dataQuery, [...queryParams, limit, offset]);

    return res.status(200).json({
      data,
      page,
      limit,
      total
    });

  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.delete('/bookings/purge', async (req, res) => {
  try {
    const db = await getDb();
    await db.run("DELETE FROM bookings WHERE status IN ('cancelled', 'rejected')");
    return res.status(200).json({ message: 'History cleared successfully.' });
  } catch (error) {
    console.error('Error purging bookings:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
