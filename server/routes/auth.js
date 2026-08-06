const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { getDb } = require('../db');

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
  console.log(`Using Ethereal/SMTP mail account: ${user}`);
  return transporter;
};

router.post('/otp', async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  if (!email.endsWith('@lnmiit.ac.in')) {
    return res.status(400).json({ error: 'Only official LNMIIT campus emails (@lnmiit.ac.in) are allowed.' });
  }

  try {
    const db = await getDb();

    const rateCheck = await db.get(
      `SELECT COUNT(*) as count FROM otp_requests 
       WHERE email = ? AND requestedAt > datetime('now', '-10 minutes')`,
      [email]
    );

    if (rateCheck && rateCheck.count >= 3) {
      return res.status(429).json({ 
        error: 'Too many OTP requests. Maximum 3 requests per 10 minutes allowed.' 
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db.run(
      'INSERT INTO otps (email, name, otp, expiresAt) VALUES (?, ?, ?, ?)',
      [email, name || null, otp, expiresAt]
    );

    await db.run(
      'INSERT INTO otp_requests (email) VALUES (?)',
      [email]
    );

    console.log(`\n==================================================`);
    console.log(`[OTP REQUEST] Email: ${email} | OTP: ${otp} | Expires At: ${expiresAt}`);
    console.log(`==================================================\n`);

    const mailTransporter = await getTransporter();
    let emailSent = false;
    let previewUrl = '';

    if (mailTransporter) {
      try {
        
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SMTP timeout')), 10000)
        );

        const mailOptions = {
          from: '"CampusDesk" <no-reply@lnmiit.ac.in>',
          to: email,
          subject: 'Your CampusDesk Verification Code',
          text: `Hello,\n\nYour 6-digit verification code is: ${otp}.\n\nThis OTP is valid for 5 minutes and can only be used once.\n\nBest regards,\nCampusDesk Team`,
          html: `<p>Hello,</p><p>Your 6-digit verification code is: <strong>${otp}</strong>.</p><p>This OTP is valid for 5 minutes and can only be used once.</p><p>Best regards,<br>CampusDesk Team</p>`
        };

        const info = await Promise.race([
          mailTransporter.sendMail(mailOptions),
          timeoutPromise
        ]);

        emailSent = true;
        previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          console.log(`[Ethereal Email Preview URL] ${previewUrl}`);
        }
      } catch (mailErr) {
        console.warn('Mail send failed or timed out:', mailErr.message);
      }
    }

    return res.status(200).json({ 
      message: 'OTP sent successfully.',
      emailSent,
      previewUrl: (emailSent && previewUrl) ? previewUrl : 'https://ethereal.email',
      debugOtp: otp
    });

  } catch (error) {
    console.error('Error generating OTP:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/verify', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }

  try {
    const db = await getDb();
    const currentTime = new Date().toISOString();

    const otpRecord = await db.get(
      `SELECT * FROM otps 
       WHERE email = ? AND otp = ? AND used = 0 AND expiresAt > ? 
       ORDER BY id DESC LIMIT 1`,
      [email, otp, currentTime]
    );

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired OTP. Please try again.' });
    }

    await db.run('UPDATE otps SET used = 1 WHERE id = ?', [otpRecord.id]);

    let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      const name = otpRecord.name || email.split('@')[0];
      const role = 'student';

      const result = await db.run(
        'INSERT INTO users (name, email, role) VALUES (?, ?, ?)',
        [name, email, role]
      );
      
      user = {
        id: result.lastID,
        name,
        email,
        role
      };
      console.log(`Registered new user: ${name} (${email}) as student.`);
    }

    const jwtSecret = process.env.JWT_SECRET || 'campusdesk_super_secret_key_67890';
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      jwtSecret,
      { expiresIn: '24h' }
    );

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

getTransporter().catch(err => console.warn('Pre-warming mail transporter failed:', err.message));

module.exports = router;
