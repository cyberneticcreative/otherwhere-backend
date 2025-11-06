/**
 * Duffel Webhooks Handler
 * Receives and processes Duffel webhook events
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  getLinkSessionByDuffelId,
  createBooking,
  updateBookingStatus,
  getBookingByDuffelOrderId,
  updateLinkSessionStatus,
  logEvent
} = require('../../db/queries');
const { query } = require('../../db');
const twilioService = require('../../services/twilioService');

/**
 * Verify Duffel webhook signature
 * @param {string} signature - X-Duffel-Signature header
 * @param {string} body - Raw request body
 * @returns {boolean}
 */
function verifyDuffelSignature(signature, body) {
  if (!process.env.DUFFEL_WEBHOOK_SECRET) {
    console.warn('⚠️ DUFFEL_WEBHOOK_SECRET not set, skipping signature verification');
    return true; // In development, allow without signature
  }

  try {
    const hmac = crypto.createHmac('sha256', process.env.DUFFEL_WEBHOOK_SECRET);
    hmac.update(body);
    const expectedSignature = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * POST /webhooks/duffel
 * Main webhook endpoint for Duffel events
 */
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Get signature and raw body
    const signature = req.headers['x-duffel-signature'];
    const rawBody = req.body.toString('utf8');

    // Verify signature
    if (signature && !verifyDuffelSignature(signature, rawBody)) {
      console.error('❌ Invalid Duffel webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parse body
    const payload = JSON.parse(rawBody);
    const { event, data } = payload;

    console.log('📥 Duffel webhook received:', {
      event,
      orderId: data?.id,
      sessionId: data?.metadata?.conversation_id
    });

    // Log event
    await logEvent('duffel_webhook_received', 'webhook', null, { event, data });

    // Route to appropriate handler
    switch (event) {
      case 'session.completed':
        await handleSessionCompleted(data);
        break;

      case 'order.created':
        await handleOrderCreated(data);
        break;

      case 'order.updated':
        await handleOrderUpdated(data);
        break;

      case 'order.cancelled':
        await handleOrderCancelled(data);
        break;

      default:
        console.log(`Unhandled Duffel event: ${event}`);
    }

    // Always respond 200 to acknowledge receipt
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Error processing Duffel webhook:', error);

    // Still return 200 to prevent Duffel from retrying
    // Log the error for investigation
    await logEvent('duffel_webhook_error', 'webhook', null, {
      error: error.message,
      stack: error.stack
    });

    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Handle session.completed event
 * Fired when user completes checkout in Duffel Links
 */
async function handleSessionCompleted(sessionData) {
  try {
    console.log('Session completed:', sessionData.id);

    // Update session status in database
    await updateLinkSessionStatus(sessionData.id, 'completed');

    await logEvent('session_completed', 'link_session', sessionData.id, sessionData);

  } catch (error) {
    console.error('Error handling session.completed:', error);
  }
}

/**
 * Handle order.created event
 * Fired when a booking is confirmed
 */
async function handleOrderCreated(order) {
  try {
    console.log('📦 Order created:', order.id);

    // Extract session ID from metadata
    const conversationId = order.metadata?.conversation_id;
    let linkSession = null;

    // Try to find the link session
    if (conversationId) {
      const sessions = await query(
        'SELECT * FROM link_sessions WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1',
        [conversationId]
      );
      linkSession = sessions.rows[0];
    }

    // Extract flight details
    const firstSlice = order.slices?.[0];
    const firstSegment = firstSlice?.segments?.[0];
    const passenger = order.passengers?.[0];

    const bookingData = {
      linkSessionId: linkSession?.id || null,
      conversationId: conversationId || null,
      duffelOrderId: order.id,
      bookingReference: order.booking_reference,
      passengerName: passenger
        ? `${passenger.given_name} ${passenger.family_name}`
        : 'Unknown',
      origin: firstSlice?.origin?.iata_code || null,
      destination: firstSlice?.destination?.iata_code || null,
      departureDate: firstSegment?.departing_at
        ? new Date(firstSegment.departing_at).toISOString().split('T')[0]
        : null,
      totalPaid: parseFloat(order.total_amount),
      currency: order.total_currency,
      ticketNumbers: order.documents?.map(d => d.unique_identifier) || [],
      status: 'confirmed',
      orderData: order
    };

    // Store booking
    const booking = await createBooking(bookingData);

    console.log('✅ Booking stored:', {
      bookingId: booking.id,
      reference: booking.booking_reference
    });

    // Send confirmation SMS
    await sendBookingConfirmationSMS(booking, order);

    // Log event
    await logEvent('booking_created', 'booking', booking.id, order);

  } catch (error) {
    console.error('Error handling order.created:', error);
    throw error;
  }
}

/**
 * Handle order.updated event
 */
async function handleOrderUpdated(order) {
  try {
    console.log('Order updated:', order.id);

    // Get existing booking
    const booking = await getBookingByDuffelOrderId(order.id);

    if (booking) {
      // Update booking data
      await query(
        `UPDATE bookings
         SET order_data = $1
         WHERE duffel_order_id = $2`,
        [JSON.stringify(order), order.id]
      );

      await logEvent('booking_updated', 'booking', booking.id, order);
    }

  } catch (error) {
    console.error('Error handling order.updated:', error);
  }
}

/**
 * Handle order.cancelled event
 */
async function handleOrderCancelled(order) {
  try {
    console.log('Order cancelled:', order.id);

    await updateBookingStatus(order.id, 'cancelled');

    await logEvent('booking_cancelled', 'booking', order.id, order);

    // TODO: Send cancellation SMS to user

  } catch (error) {
    console.error('Error handling order.cancelled:', error);
  }
}

/**
 * Send booking confirmation SMS to user
 */
async function sendBookingConfirmationSMS(booking, order) {
  try {
    // Get conversation to find phone number
    if (!booking.conversation_id) {
      console.warn('No conversation ID for booking, cannot send SMS');
      return;
    }

    const conversation = await query(
      'SELECT phone FROM conversations WHERE id = $1',
      [booking.conversation_id]
    );

    if (!conversation.rows.length) {
      console.warn('Conversation not found, cannot send SMS');
      return;
    }

    const phone = conversation.rows[0].phone;

    // Format confirmation message
    const message = formatConfirmationMessage(booking, order);

    // Send SMS
    await twilioService.sendSMS(phone, message);

    console.log('✅ Confirmation SMS sent to:', phone);

    await logEvent('confirmation_sms_sent', 'booking', booking.id, {
      phone,
      message
    });

  } catch (error) {
    console.error('Error sending confirmation SMS:', error);
  }
}

/**
 * Format booking confirmation message
 */
function formatConfirmationMessage(booking, order) {
  let message = `✅ Booking Confirmed!\n\n`;

  message += `Reference: ${booking.booking_reference}\n`;
  message += `Passenger: ${booking.passenger_name}\n\n`;

  if (booking.origin && booking.destination) {
    message += `Route: ${booking.origin} → ${booking.destination}\n`;
  }

  if (booking.departure_date) {
    message += `Departure: ${booking.departure_date}\n`;
  }

  if (booking.total_paid) {
    message += `Total: ${booking.currency} ${booking.total_paid}\n`;
  }

  message += `\n🎉 Have a great trip!\n`;
  message += `We'll monitor your fare and alert you if a better option appears.`;

  return message;
}

module.exports = router;
