document.addEventListener('DOMContentLoaded', () => {
  const otpRequestForm = document.getElementById('otp-request-form');
  const otpVerifyForm = document.getElementById('otp-verify-form');
  
  const userNameInput = document.getElementById('user-name');
  const userEmailInput = document.getElementById('user-email');
  const otpCodeInput = document.getElementById('otp-code');
  
  const sendOtpBtn = document.getElementById('send-otp-btn');
  const verifyOtpBtn = document.getElementById('verify-otp-btn');
  const resendOtpBtn = document.getElementById('resend-otp-btn');
  const changeEmailBtn = document.getElementById('change-email-btn');
  
  const alertBanner = document.getElementById('alert-banner');
  const successBanner = document.getElementById('success-banner');
  const displayEmail = document.getElementById('display-email');
  
  const cooldownContainer = document.getElementById('cooldown-container');
  const cooldownTimer = document.getElementById('cooldown-timer');
  
  let cooldownInterval = null;
  let currentEmail = '';
  let currentName = '';

  function showAlert(msg) {
    alertBanner.textContent = msg;
    alertBanner.style.display = 'block';
    successBanner.style.display = 'none';
  }

  function showSuccess(msg, linkUrl = null) {
    let htmlContent = msg;
    if (linkUrl) {
      htmlContent += ` <a href="${linkUrl}" target="_blank" style="text-decoration: underline; font-weight: bold; color: inherit;">Open Ethereal Mailbox</a>`;
    }
    successBanner.innerHTML = htmlContent;
    successBanner.style.display = 'block';
    alertBanner.style.display = 'none';
  }

  function clearBanners() {
    alertBanner.style.display = 'none';
    successBanner.style.display = 'none';
  }

  function startCooldown() {
    let timeLeft = 30;
    cooldownContainer.style.display = 'block';
    resendOtpBtn.style.display = 'none';
    cooldownTimer.textContent = timeLeft;

    if (cooldownInterval) clearInterval(cooldownInterval);

    cooldownInterval = setInterval(() => {
      timeLeft -= 1;
      cooldownTimer.textContent = timeLeft;
      
      if (timeLeft <= 0) {
        clearInterval(cooldownInterval);
        cooldownContainer.style.display = 'none';
        resendOtpBtn.style.display = 'block';
      }
    }, 1000);
  }

  otpRequestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();
    
    currentEmail = userEmailInput.value.trim();
    currentName = userNameInput.value.trim();

    if (!currentEmail) return;

    if (!currentEmail.endsWith('@lnmiit.ac.in')) {
      showAlert('Only LNMIIT campus emails (@lnmiit.ac.in) are allowed.');
      return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = 'Sending...';

    try {
      const response = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, name: currentName })
      });

      const data = await response.json();

      if (response.ok) {
        displayEmail.textContent = currentEmail;
        otpRequestForm.style.display = 'none';
        otpVerifyForm.style.display = 'block';
        
        let successMsg = 'OTP generated successfully!';
        showSuccess(successMsg, data.previewUrl);
        
        if (data.debugOtp) {
          console.log("[CampusDesk Testing Mode] OTP Code:", data.debugOtp);
          console.log("[CampusDesk Testing Mode] Ethereal Login: wjxexfouwaaqbvbb@ethereal.email / VJhJWyWtQKvRdAMK7N");
        }
        
        startCooldown();
      } else {
        showAlert(data.error || 'Failed to send OTP.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Network error. Please try again.');
    } finally {
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'Send Verification Code';
    }
  });

  otpVerifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearBanners();

    const otp = otpCodeInput.value.trim();
    if (!otp || otp.length !== 6) {
      showAlert('Please enter a valid 6-digit OTP.');
      return;
    }

    verifyOtpBtn.disabled = true;
    verifyOtpBtn.textContent = 'Verifying...';

    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, otp })
      });

      const data = await response.json();

      if (response.ok) {
        saveSession(data.token, data.user);
        
        window.location.replace('/resources');
      } else {
        showAlert(data.error || 'Verification failed.');
      }
    } catch (err) {
      console.error(err);
      showAlert('Network error. Please try again.');
    } finally {
      verifyOtpBtn.disabled = false;
      verifyOtpBtn.textContent = 'Verify & Log In';
    }
  });

  resendOtpBtn.addEventListener('click', async () => {
    clearBanners();
    resendOtpBtn.disabled = true;
    resendOtpBtn.textContent = 'Sending...';

    try {
      const response = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, name: currentName })
      });

      const data = await response.json();

      if (response.ok) {
        showSuccess('Verification code resent successfully.', data.previewUrl);
        if (data.debugOtp) {
          console.log("[CampusDesk Testing Mode] OTP Code:", data.debugOtp);
          console.log("[CampusDesk Testing Mode] Ethereal Login: wjxexfouwaaqbvbb@ethereal.email / VJhJWyWtQKvRdAMK7N");
        }
        startCooldown();
      } else {
        showAlert(data.error || 'Failed to resend OTP.');
        resendOtpBtn.disabled = false;
        resendOtpBtn.textContent = 'Resend OTP';
      }
    } catch (err) {
      console.error(err);
      showAlert('Network error. Please try again.');
      resendOtpBtn.disabled = false;
      resendOtpBtn.textContent = 'Resend OTP';
    }
  });

  changeEmailBtn.addEventListener('click', () => {
    clearBanners();
    if (cooldownInterval) clearInterval(cooldownInterval);
    otpVerifyForm.style.display = 'none';
    otpRequestForm.style.display = 'block';
  });
});
