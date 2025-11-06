/**
 * PostgreSQL Database Client
 * Manages connection pool and provides query interface
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 20, // Maximum number of clients in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log pool errors
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Database connected');
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;

    // Log slow queries
    if (duration > 1000) {
      console.warn('Slow query detected:', {
        text,
        duration,
        rows: res.rowCount
      });
    }

    return res;
  } catch (error) {
    console.error('Database query error:', {
      text,
      params,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
async function getClient() {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;

  // Wrap query to log
  client.query = (...args) => {
    client.lastQuery = args;
    return query.apply(client, args);
  };

  // Wrap release to log
  client.release = () => {
    client.query = query;
    client.release = release;
    return release.apply(client);
  };

  return client;
}

/**
 * Run database migrations
 * @returns {Promise<void>}
 */
async function runMigrations() {
  console.log('Running database migrations...');

  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;

    console.log(`Executing migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    try {
      await query(sql);
      console.log(`✅ Migration ${file} completed`);
    } catch (error) {
      console.error(`❌ Migration ${file} failed:`, error.message);
      throw error;
    }
  }

  console.log('✅ All migrations completed');
}

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('Database connection test:', result.rows[0]);
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error.message);
    return false;
  }
}

/**
 * Close all database connections
 * @returns {Promise<void>}
 */
async function close() {
  await pool.end();
  console.log('Database pool closed');
}

module.exports = {
  query,
  getClient,
  pool,
  runMigrations,
  testConnection,
  close
};
