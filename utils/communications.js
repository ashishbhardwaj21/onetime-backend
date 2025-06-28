const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('./logger');

// Email configuration
const createEmailTransporter = () => {
  if (process.env.SENDGRID_API_KEY) {
    // SendGrid configuration
    return nodemailer.createTransporter({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  } else {
    // Development SMTP configuration (using Ethereal)
    return nodemailer.createTransporter({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'ethereal.user@ethereal.email',
        pass: 'ethereal.pass'
      }
    });
  }
};

// SMS configuration
const smsClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

// Send verification email
const sendVerificationEmail = async (email, verificationCode, name) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@onetime.app',
      to: email,
      subject: 'Verify your OneTime account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ff6b9d, #c44ac0); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">OneTime</h1>
            <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Welcome to authentic dating</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${name}! 👋</h2>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              Welcome to OneTime! We're excited to have you join our community of authentic daters.
            </p>
            
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              To complete your registration, please verify your email address using the code below:
            </p>
            
            <div style="background: white; border: 2px dashed #ff6b9d; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
              <h3 style="color: #333; margin: 0 0 10px 0;">Verification Code</h3>
              <div style="font-size: 32px; font-weight: bold; color: #ff6b9d; letter-spacing: 5px; font-family: 'Courier New', monospace;">
                ${verificationCode}
              </div>
            </div>
            
            <p style="color: #666; line-height: 1.6; font-size: 14px;">
              This code will expire in 24 hours. If you didn't create an account with OneTime, please ignore this email.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                OneTime - Where every match matters<br>
                <a href="mailto:support@onetime.app" style="color: #ff6b9d;">support@onetime.app</a>
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info('Verification email sent successfully', { 
      email, 
      messageId: result.messageId 
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to send verification email:', { 
      email, 
      error: error.message 
    });
    throw error;
  }
};

// Send welcome email
const sendWelcomeEmail = async (email, name) => {
  try {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
      from: process.env.FROM_EMAIL || 'noreply@onetime.app',
      to: email,
      subject: 'Welcome to OneTime! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #ff6b9d, #c44ac0); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 32px;">🎉 Welcome to OneTime!</h1>
            <p style="color: white; margin: 15px 0 0 0; font-size: 18px; opacity: 0.9;">
              Your dating journey starts now
            </p>
          </div>
          
          <div style="background: #f8f9fa; padding: 40px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Hi ${name}! 🌟</h2>
            
            <p style="color: #666; line-height: 1.8; font-size: 16px;">
              Congratulations! Your email has been verified and your OneTime profile is now active.
            </p>
            
            <div style="background: white; border-left: 4px solid #ff6b9d; padding: 20px; margin: 30px 0; border-radius: 0 8px 8px 0;">
              <h3 style="color: #ff6b9d; margin-top: 0;">🚀 Ready to get started?</h3>
              <ul style="color: #666; line-height: 1.6;">
                <li>Upload your best photos</li>
                <li>Complete your profile prompts</li>
                <li>Set your discovery preferences</li>
                <li>Start swiping and find your people!</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="onetime://app" style="background: linear-gradient(135deg, #ff6b9d, #c44ac0); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">
                Open OneTime App
              </a>
            </div>
            
            <p style="color: #666; line-height: 1.6; font-size: 14px;">
              Remember: OneTime is about quality connections, not endless swiping. Take your time, be authentic, and have fun!
            </p>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                Questions? We're here to help!<br>
                <a href="mailto:support@onetime.app" style="color: #ff6b9d;">support@onetime.app</a>
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info('Welcome email sent successfully', { 
      email, 
      messageId: result.messageId 
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to send welcome email:', { 
      email, 
      error: error.message 
    });
    throw error;
  }
};

// Send SMS verification
const sendSMS = async (phoneNumber, message) => {
  try {
    if (!smsClient) {
      throw new Error('SMS service not configured');
    }
    
    const result = await smsClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    
    logger.info('SMS sent successfully', { 
      phoneNumber, 
      sid: result.sid 
    });
    
    return result;
  } catch (error) {
    logger.error('Failed to send SMS:', { 
      phoneNumber, 
      error: error.message 
    });
    throw error;
  }
};

// Send SMS verification code
const sendSMSVerification = async (phoneNumber, verificationCode) => {
  const message = `Your OneTime verification code is: ${verificationCode}. Valid for 10 minutes.`;
  return sendSMS(phoneNumber, message);
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendSMS,
  sendSMSVerification
};