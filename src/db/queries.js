/**
 * Database Query Helpers
 * Common database operations for Otherwhere
 */

const db = require('./index');

/**
 * CONVERSATIONS
 */

async function getConversationByPhone(phone) {
  const result = await db.query(
    'SELECT * FROM conversations WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [phone]
  );
  return result.rows[0];
}

async function createConversation(phone, intent = null, searchParams = {}) {
  const result = await db.query(
    `INSERT INTO conversations (phone, intent, search_params)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [phone, intent, JSON.stringify(searchParams)]
  );
  return result.rows[0];
}

async function updateConversation(id, updates) {
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
  const result = await db.query(
    'SELECT * FROM link_sessions WHERE duffel_session_id = $1',
    [duffelSessionId]
  );
  return result.rows[0];
}

async function updateLinkSessionStatus(duffelSessionId, status) {
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
  const result = await db.query(
    'SELECT * FROM bookings WHERE duffel_order_id = $1',
    [duffelOrderId]
  );
  return result.rows[0];
}

async function updateBookingStatus(duffelOrderId, status) {
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
  const result = await db.query(
    'SELECT * FROM bookings WHERE conversation_id = $1 ORDER BY created_at DESC',
    [conversationId]
  );
  return result.rows;
}

async function getAllBookings(limit = 100) {
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
  const result = await db.query(
    `INSERT INTO event_logs (event_type, entity_type, entity_id, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [eventType, entityType, entityId, JSON.stringify(payload)]
  );
  return result.rows[0];
}

async function getEventLogs(options = {}) {
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
 * UTILITY QUERIES
 */

async function getStats() {
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
