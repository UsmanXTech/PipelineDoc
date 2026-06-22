const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('Error: POSTGRES_URL environment variable is not defined.');
  process.exit(1);
}

const sqlFilePath = path.join(__dirname, 'db-auth-init.sql');

async function run() {
  console.log(`Connecting to database at ${connectionString.split('@')[1] || 'configured host'}...`);
  const client = new Client({ connectionString });
  await client.connect();

  console.log(`Reading SQL file: ${sqlFilePath}...`);
  const sql = fs.readFileSync(sqlFilePath, 'utf8');

  console.log('Executing database schema updates...');
  await client.query(sql);
  
  console.log('Database auth tables initialized successfully!');
  await client.end();
}

run().catch(err => {
  console.error('Failed to migrate database:', err.message);
  process.exit(1);
});
