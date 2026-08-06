const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { getDb } = require('./db');

let transporter = null;
const getTransporter = async () => {
  if (transporter !== null) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
  const port = parseInt(process.env.SMTP_PORT || '2525');

  const user = process.env.SMTP_USER || 'wjxexfouwaaqbvbb@ethereal.email';
  const pass = process.env.SMTP_PASS || 'VJhJWyWtQKvRdAMK7N';

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  console.log(`[CRON] Using Ethereal/SMTP mail account: ${user}`);
  return transporter;
};

function formatLocalTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function startCronJobs() {
  console.log('Registering background cron tasks (running every minute)...');

  cron.schedule('* * * * *', async () => {
    const db = await getDb();
    const now = new Date();
    const nowIso = now.toISOString();

    try {
      const completedResult = await db.run(
        `UPDATE bookings 
         SET status = 'completed' 
         WHERE status = 'confirmed' AND endTime <= ?`,
        [nowIso]
      );
      if (completedResult.changes > 0) {
        console.log(`[CRON] Marked ${completedResult.changes} past bookings as COMPLETED.`);
      }
    } catch (err) {
      console.error('[CRON] Error marking past bookings as completed:', err);
    }

    try {
      
      const oneHourLaterIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

      const bookingsToRemind = await db.all(
        `SELECT b.id, b.startTime, b.endTime, b.purpose, 
                u.name as userName, u.email as userEmail,
                r.name as resourceName, r.location as resourceLocation
         FROM bookings b
         JOIN users u ON b.userId = u.id
         JOIN resources r ON b.resourceId = r.id
         WHERE b.status = 'confirmed' 
           AND b.reminderSent = 0 
           AND b.startTime <= ? 
           AND b.startTime > ?`,
        [oneHourLaterIso, nowIso]
      );

      if (bookingsToRemind.length > 0) {
        console.log(`[CRON] Found ${bookingsToRemind.length} bookings starting within 1 hour. Sending reminders...`);
        const mailTransporter = await getTransporter();

        for (const booking of bookingsToRemind) {
          const startTimeFormatted = formatLocalTime(booking.startTime);
          const dateStr = new Date(booking.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

          console.log(`\n==================================================`);
          console.log(`[EMAIL REMINDER SENDING]`);
          console.log(`Recipient: ${booking.userName} (${booking.userEmail})`);
          console.log(`Resource: ${booking.resourceName} @ ${booking.resourceLocation}`);
          console.log(`Time: ${dateStr} at ${startTimeFormatted}`);
          console.log(`==================================================\n`);

          await db.run('UPDATE bookings SET reminderSent = 1 WHERE id = ?', [booking.id]);

          if (mailTransporter) {
            try {
              const mailOptions = {
                from: '"CampusDesk Reminders" <no-reply@lnmiit.ac.in>',
                to: booking.userEmail,
                subject: `Reminder: Your booking for ${booking.resourceName} starts soon`,
                text: `Hello ${booking.userName},\n\nThis is a friendly reminder that your booking for the resource "${booking.resourceName}" starts at ${startTimeFormatted} (${dateStr}).\n\nLocation: ${booking.resourceLocation}\nPurpose: ${booking.purpose}\n\nHave a great session!\n\nBest regards,\nCampusDesk Team`,
                html: `<p>Hello <strong>${booking.userName}</strong>,</p>
                       <p>This is a friendly reminder that your booking for the resource <strong>"${booking.resourceName}"</strong> starts in less than an hour at <strong>${startTimeFormatted}</strong> (${dateStr}).</p>
                       <p><strong>Location:</strong> ${booking.resourceLocation}<br>
                       <strong>Purpose:</strong> ${booking.purpose}</p>
                       <p>Have a great session!</p>
                       <p>Best regards,<br>CampusDesk Team</p>`
              };

              const info = await mailTransporter.sendMail(mailOptions);
              const previewUrl = nodemailer.getTestMessageUrl(info);
              if (previewUrl) {
                console.log(`[CRON] Ethereal Reminder Preview URL: ${previewUrl}`);
              }
            } catch (mailErr) {
              console.error(`[CRON] Failed to send reminder email to ${booking.userEmail}:`, mailErr.message);
            }
          }
        }
      }
    } catch (err) {
      console.error('[CRON] Error sending email reminders:', err);
    }
  });
}

module.exports = {
  startCronJobs
};
