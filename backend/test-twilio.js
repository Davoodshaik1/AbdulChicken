const twilio = require('twilio');
require('dotenv').config();

console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID);
console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN);
console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER);
console.log('OWNER_PHONE_NUMBER:', process.env.OWNER_PHONE_NUMBER);

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

client.messages.create({
  body: 'Test SMS from Twilio',
  from: process.env.TWILIO_PHONE_NUMBER,
  to: process.env.OWNER_PHONE_NUMBER,
}).then(message => console.log('SMS sent:', message.sid))
  .catch(error => console.error('Error sending SMS:', error.message));