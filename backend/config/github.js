require('dotenv').config();

module.exports = {
  token: process.env.GITHUB_TOKEN,
  webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
};
