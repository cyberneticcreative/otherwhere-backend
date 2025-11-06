/**
 * Database Query Helpers
 * Common database operations for Otherwhere
 */

const db = require('./index');

// Helper to check if database is available
function requireDatabase() {
  if (!db.isConfigured) {
    console.warn('Database operation skipped - DATABASE_URL not configured');
    return false;
  }
  return true;
}

/**
 * CONVERSATIONS
 */

async function getConversationByPhone(phone) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    'SELECT * FROM conversations WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [phone]
  );
  return result.rows[0];
}

async function createConversation(phone, intent = null, searchParams = {}) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    `INSERT INTO conversations (phone, intent, search_params)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [phone, intent, JSON.stringify(searchParams)]
  );
  return result.rows[0];
}

async function updateConversation(id, updates) {
  if (!requireDatabase()) return null;

  const { intent, searchParams } = updates;
  const result = await db.query(
    `UPDATE conversations
     SET intent = COALESCE($2, intent),
         search_params = COALESCE($3, search_params),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, intent, searchParams ? JSON.stringify(searchParams) : null]
  );
  return result.rows[0];
}

async function getOrCreateConversation(phone, intent = null, searchParams = {}) {
  if (!requireDatabase()) return null;

  let conversation = await getConversationByPhone(phone);
  if (!conversation) {
    conversation = await createConversation(phone, intent, searchParams);
  }
  return conversation;
}

/**
 * LINK SESSIONS
 */

async function createLinkSession(data) {
  if (!requireDatabase()) return null;

  const {
    conversationId,
    duffelSessionId,
    sessionUrl,
    expiresAt,
    searchParams
  } = data;

  const result = await db.query(
    `INSERT INTO link_sessions
     (conversation_id, duffel_session_id, session_url, expires_at, search_params, status)
     VALUES ($1, $2, $3, $4, $5, 'sent')
     RETURNING *`,
    [
      conversationId,
      duffelSessionId,
      sessionUrl,
      expiresAt,
      JSON.stringify(searchParams)
    ]
  );
  return result.rows[0];
}

async function getLinkSessionByDuffelId(duffelSessionId) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    'SELECT * FROM link_sessions WHERE duffel_session_id = $1',
    [duffelSessionId]
  );
  return result.rows[0];
}

async function updateLinkSessionStatus(duffelSessionId, status) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    `UPDATE link_sessions
     SET status = $2
     WHERE duffel_session_id = $1
     RETURNING *`,
    [duffelSessionId, status]
  );
  return result.rows[0];
}

async function getLinkSessionsByConversation(conversationId) {
  if (!requireDatabase()) return [];

  const result = await db.query(
    'SELECT * FROM link_sessions WHERE conversation_id = $1 ORDER BY created_at DESC',
    [conversationId]
  );
  return result.rows;
}

/**
 * BOOKINGS
 */

async function createBooking(data) {
  if (!requireDatabase()) return null;

  const {
    linkSessionId,
    conversationId,
    duffelOrderId,
    bookingReference,
    passengerName,
    origin,
    destination,
    departureDate,
    totalPaid,
    currency,
    ticketNumbers,
    status,
    orderData
  } = data;

  const result = await db.query(
    `INSERT INTO bookings
     (link_session_id, conversation_id, duffel_order_id, booking_reference,
      passenger_name, origin, destination, departure_date, total_paid, currency,
      ticket_numbers, status, order_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      linkSessionId,
      conversationId,
      duffelOrderId,
      bookingReference,
      passengerName,
      origin,
      destination,
      departureDate,
      totalPaid,
      currency,
      ticketNumbers,
      status || 'confirmed',
      JSON.stringify(orderData)
    ]
  );
  return result.rows[0];
}

async function getBookingByDuffelOrderId(duffelOrderId) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    'SELECT * FROM bookings WHERE duffel_order_id = $1',
    [duffelOrderId]
  );
  return result.rows[0];
}

async function updateBookingStatus(duffelOrderId, status) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    `UPDATE bookings
     SET status = $2
     WHERE duffel_order_id = $1
     RETURNING *`,
    [duffelOrderId, status]
  );
  return result.rows[0];
}

async function getBookingsByConversation(conversationId) {
  if (!requireDatabase()) return [];

  const result = await db.query(
    'SELECT * FROM bookings WHERE conversation_id = $1 ORDER BY created_at DESC',
    [conversationId]
  );
  return result.rows;
}

async function getAllBookings(limit = 100) {
  if (!requireDatabase()) return [];

  const result = await db.query(
    'SELECT * FROM bookings ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return result.rows;
}

/**
 * EVENT LOGS
 */

async function logEvent(eventType, entityType, entityId, payload) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    `INSERT INTO event_logs (event_type, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [eventType, entityType, entityId, JSON.stringify(payload)]
  );
  return result.rows[0];
}

async function getEventLogs(options = {}) {
  if (!requireDatabase()) return [];

  const { eventType, entityType, entityId, limit = 100 } = options;

  let query = 'SELECT * FROM event_logs WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (eventType) {
    query += ` AND event_type = $${paramCount}`;
    params.push(eventType);
    paramCount++;
  }

  if (entityType) {
    query += ` AND entity_type = $${paramCount}`;
    params.push(entityType);
    paramCount++;
  }

  if (entityId) {
    query += ` AND entity_id = $${paramCount}`;
    params.push(entityId);
    paramCount++;
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
}

/**
 * BOOKING LINKS (Custom Duffel Offers flow)
 */

async function createBookingLink(data) {
  if (!requireDatabase()) return null;

  const {
    tokenJti,
    offerId,
    accountId,
    conversationId,
    offerSnapshot,
    expiresAt
  } = data;

  const result = await db.query(
    `INSERT INTO booking_links
     (token_jti, offer_id, account_id, conversation_id, offer_snapshot, expires_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     RETURNING *`,
    [
      tokenJti,
      offerId,
      accountId,
      conversationId,
      JSON.stringify(offerSnapshot),
      expiresAt
    ]
  );
  return result.rows[0];
}

async function getBookingLinkByJti(tokenJti) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    'SELECT * FROM booking_links WHERE token_jti = $1',
    [tokenJti]
  );
  return result.rows[0];
}

async function updateBookingLinkStatus(tokenJti, status) {
  if (!requireDatabase()) return null;

  const result = await db.query(
    `UPDATE booking_links
     SET status = $2
     WHERE token_jti = $1
     RETURNING *`,
    [tokenJti, status]
  );
  return result.rows[0];
}

async function getBookingLinksByConversation(conversationId) {
  if (!requireDatabase()) return [];

  const result = await db.query(
    'SELECT * FROM booking_links WHERE conversation_id = $1 ORDER BY created_at DESC',
    [conversationId]
  );
  return result.rows;
}

async function cleanupExpiredBookingLinks() {
  if (!requireDatabase()) return 0;

  const result = await db.query(
    `UPDATE booking_links
     SET status = 'expired'
     WHERE expires_at < NOW() AND status = 'active'
     RETURNING id`
  );
  return result.rowCount;
}

/**
 * UTILITY QUERIES
 */

async function getStats() {
  if (!requireDatabase()) {
    return {
      conversations: 0,
      linkSessions: 0,
      bookings: 0,
      totalRevenue: 0,
      confirmedBookings: 0
    };
  }

  const [
    conversationsCount,
    linkSessionsCount,
    bookingsCount,
    totalRevenue
  ] = await Promise.all([
    db.query('SELECT COUNT(*) as count FROM conversations'),
    db.query('SELECT COUNT(*) as count FROM link_sessions'),
    db.query('SELECT COUNT(*) as count FROM bookings'),
    db.query('SELECT SUM(total_paid) as total, COUNT(*) as count FROM bookings WHERE status = $1', ['confirmed'])
  ]);

  return {
    conversations: parseInt(conversationsCount.rows[0].count),
    linkSessions: parseInt(linkSessionsCount.rows[0].count),
    bookings: parseInt(bookingsCount.rows[0].count),
    totalRevenue: parseFloat(totalRevenue.rows[0].total) || 0,
    confirmedBookings: parseInt(totalRevenue.rows[0].count)
  };
}

module.exports = {
  // Conversations
  getConversationByPhone,
  createConversation,
  updateConversation,
  getOrCreateConversation,

  // Link Sessions
  createLinkSession,
  getLinkSessionByDuffelId,
  updateLinkSessionStatus,
  getLinkSessionsByConversation,

  // Booking Links (Custom Duffel Offers flow)
  createBookingLink,
  getBookingLinkByJti,
  updateBookingLinkStatus,
  getBookingLinksByConversation,
  cleanupExpiredBookingLinks,

  // Bookings
  createBooking,
  getBookingByDuffelOrderId,
  updateBookingStatus,
  getBookingsByConversation,
  getAllBookings,

  // Event Logs
  logEvent,
  getEventLogs,

  // Utilities
  getStats
};
