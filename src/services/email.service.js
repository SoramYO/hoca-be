const nodemailer = require('nodemailer');
const { EMAIL_PASSWORD, EMAIL_USER, EMAIL_PORT, EMAIL_HOST } = require('../config/env');

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD
  }
});

const sendEmail = async (toOrOptions, subjectAttr, htmlAttr) => {
  let to, subject, html;

  if (typeof toOrOptions === 'object' && toOrOptions.to) {
     // Handle object signature
     ({ to, subject, html } = toOrOptions);
  } else {
     // Handle positional signature
     to = toOrOptions;
     subject = subjectAttr;
     html = htmlAttr;
  }

  try {
    const info = await transporter.sendMail({
      from: `"HOCA Platform" <${EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    return null;
  }
};

module.exports = {
  sendEmail
};
