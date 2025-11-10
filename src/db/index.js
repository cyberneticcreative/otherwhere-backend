/**
 * PostgreSQL Database Client
 * Manages connection pool and provides query interface
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');

// Check if database is configured
const isConfigured = !!process.env.DATABASE_URL;

// Create connection pool only if DATABASE_URL is set
let pool = null;
let initPromise = null;

if (isConfigured) {
  // Initialize database connection asynchronously
  initPromise = (async () => {
    try {
      // Parse DATABASE_URL
      const dbUrl = new URL(process.env.DATABASE_URL);
      const hostname = dbUrl.hostname;

      // Resolve hostname to IPv4 address to avoid IPv6 ENETUNREACH errors
      let host = hostname;
      try {
        console.log(`🔍 Resolving database host: ${hostname}`);

        // Try to resolve to IPv4 first
        const addresses = await dns.resolve4(hostname);
        if (addresses && addresses.length > 0) {
          host = addresses[0];
          console.log(`✅ Resolved ${hostname} to IPv4: ${host}`);
        } else {
          console.warn(`⚠️ No IPv4 address found for ${hostname}, using hostname`);
        }
      } catch (resolveError) {
        console.warn(`⚠️ DNS resolution failed for ${hostname}:`, resolveError.message);
        console.log('   Falling back to hostname (connection may use IPv6)');
        // Continue with original hostname if resolution fails
      }

      // Configure connection with resolved IPv4 address
      const connectionConfig = {
        host: host,
        port: parseInt(dbUrl.port) || 5432,
        database: dbUrl.pathname.slice(1),
        user: dbUrl.username,
        password: dbUrl.password,
        ssl: process.env.NODE_ENV === 'production' ? {
          rejectUnauthorized: false
        } : false,
        max: 20, // Maximum number of clients in pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      };

      pool = new Pool(connectionConfig);

      // Log pool errors
      pool.on('error', (err, client) => {
        console.error('Unexpected error on idle client', err);
      });

      // Test connection
      pool.on('connect', () => {
        console.log('✅ Database connected');
      });

      console.log(`📊 Database pool configured for ${host}:${connectionConfig.port}`);
    } catch (error) {
      console.error('❌ Database initialization error:', error.message);
      throw error;
    }
  })();
}

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
async function query(text, params) {
  if (!isConfigured) {
    throw new Error('Database not configured. Set DATABASE_URL environment variable.');
  }

  // Wait for initialization to complete
  if (initPromise) {
    await initPromise;
  }

  if (!pool) {
    throw new Error('Database pool not initialized');
  }

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
  if (!isConfigured) {
    throw new Error('Database not configured. Set DATABASE_URL environment variable.');
  }

  // Wait for initialization to complete
  if (initPromise) {
    await initPromise;
  }

  if (!pool) {
    throw new Error('Database pool not initialized');
  }

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
  // Wait for initialization to complete before closing
  if (initPromise) {
    await initPromise;
  }

  if (pool) {
    await pool.end();
    console.log('Database pool closed');
  }
}

/**
 * Wait for database initialization
 * @returns {Promise<void>}
 */
async function waitForInit() {
  if (initPromise) {
    await initPromise;
  }
}

module.exports = {
  query,
  getClient,
  pool,
  runMigrations,
  testConnection,
  close,
  isConfigured,
  waitForInit
};
