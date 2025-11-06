/**
 * Duffel Offers Routes
 * Handle custom booking flow using Duffel Flights API
 * Replaces Duffel Links with custom booking pages
 */

const express = require('express');
const router = express.Router();
const duffelOffers = require('../services/duffelOffersService');
const tokenService = require('../utils/tokenService');
const {
  getOrCreateConversation,
  createBookingLink,
  getBookingLinkByJti,
  updateBookingLinkStatus,
  createBooking,
  logEvent
} = require('../db/queries');

/**
 * POST /offers
 * Search for flight offers
 *
 * Body:
 * {
 *   origin: "YVR",
 *   destination: "NRT",
 *   departure_date: "2025-11-15",
 *   return_date: "2025-11-22",  // optional
 *   passengers: 1,
 *   cabin_class: "economy",
 *   phone: "+1234567890"  // optional, for linking to conversation
 * }
 *
 * Returns: { offers: [...], count: N }
 */
router.post('/', async (req, res) => {
  try {
    const {
      origin,
      destination,
      departure_date,
      return_date,
      passengers = 1,
      cabin_class = 'economy',
      phone
    } = req.body;

    // Validate required fields
    if (!origin || !destination || !departure_date) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['origin', 'destination', 'departure_date']
      });
    }

    // Get or create conversation if phone provided
    let conversationId = null;
    if (phone) {
      const conversation = await getOrCreateConversation(
        phone,
        'browse',
        { origin, destination, departure_date, return_date, passengers, cabin_class }
      );
      conversationId = conversation?.id;
    }

    // Search for flights
    const offers = await duffelOffers.searchFlights({
      origin,
      destination,
      departure_date,
      return_date,
      passengers,
      cabin_class,
      conversationId
    });

    res.json({
      success: true,
      offers,
      count: offers.length,
      search_params: {
        origin,
        destination,
        departure_date,
        return_date,
        passengers,
        cabin_class
      }
    });

  } catch (error) {
    console.error('Error searching offers:', error);
    res.status(500).json({
      error: 'Failed to search flights',
      message: error.message
    });
  }
});

/**
 * GET /offers/:offerId
 * Get a specific offer by ID
 */
router.get('/:offerId', async (req, res) => {
  try {
    const { offerId } = req.params;

    const offer = await duffelOffers.getOffer(offerId);

    res.json({
      success: true,
      offer
    });

  } catch (error) {
    console.error('Error fetching offer:', error);
    res.status(500).json({
      error: 'Failed to fetch offer',
      message: error.message
    });
  }
});

/**
 * POST /offers/booking-link
 * Create a secure booking link for a selected offer
 *
 * Body:
 * {
 *   offer_id: "off_123",
 *   conversation_id: "uuid",  // optional
 *   account_id: "uuid",  // optional
 *   expires_in_minutes: 30  // optional, default 30
 * }
 *
 * Returns: { url, token, expires_at }
 */
router.post('/booking-link', async (req, res) => {
  try {
    const {
      offer_id,
      conversation_id,
      account_id,
      expires_in_minutes = 30
    } = req.body;

    if (!offer_id) {
      return res.status(400).json({
        error: 'offer_id is required'
      });
    }

    // Get offer details to cache in link
    const offer = await duffelOffers.getOffer(offer_id);

    // Sign JWT token
    const { token, jti, expiresAt } = tokenService.signBookingToken(
      {
        offer_id,
        conversation_id,
        account_id
      },
      expires_in_minutes
    );

    // Store booking link in database
    await createBookingLink({
      tokenJti: jti,
      offerId: offer_id,
      accountId: account_id || null,
      conversationId: conversation_id || null,
      offerSnapshot: offer,
      expiresAt
    });

    // Generate booking URL
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const bookingUrl = `${baseUrl}/book/${token}`;

    // Log event
    if (conversation_id) {
      await logEvent('booking_link_created', 'booking_link', jti, {
        offer_id,
        conversation_id,
        expires_at: expiresAt
      });
    }

    res.json({
      success: true,
      url: bookingUrl,
      token,
      expires_at: expiresAt,
      offer_summary: {
        id: offer.id,
        total: offer.total_with_fee,
        currency: offer.total_currency,
        departure: offer.departure,
        arrival: offer.arrival
      }
    });

  } catch (error) {
    console.error('Error creating booking link:', error);
    res.status(500).json({
      error: 'Failed to create booking link',
      message: error.message
    });
  }
});

/**
 * GET /offers/book/:token
 * Get booking page data for a token
 * Returns offer details, fee, and total for display
 */
router.get('/book/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    let claims;
    try {
      claims = tokenService.verifyBookingToken(token);
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid or expired booking link',
        message: error.message
      });
    }

    // Get booking link from database
    const bookingLink = await getBookingLinkByJti(claims.jti);

    if (!bookingLink) {
      return res.status(404).json({
        error: 'Booking link not found'
      });
    }

    // Check if already consumed
    if (bookingLink.status === 'consumed') {
      return res.status(410).json({
        error: 'This booking link has already been used'
      });
    }

    // Check if expired
    if (bookingLink.status === 'expired' || new Date(bookingLink.expires_at) < new Date()) {
      return res.status(410).json({
        error: 'This booking link has expired'
      });
    }

    // Get fresh offer data (to check for price changes)
    let currentOffer;
    try {
      currentOffer = await duffelOffers.getOffer(bookingLink.offer_id);
    } catch (error) {
      // If offer is no longer available, use cached snapshot
      console.warn('Could not fetch fresh offer, using snapshot:', error.message);
      currentOffer = bookingLink.offer_snapshot;
    }

    // Check for price changes
    const cachedOffer = bookingLink.offer_snapshot;
    const priceChanged = cachedOffer.total_amount !== currentOffer.total_amount;

    res.json({
      success: true,
      token,
      offer: currentOffer,
      cached_offer: cachedOffer,
      price_changed: priceChanged,
      expires_at: bookingLink.expires_at,
      metadata: {
        conversation_id: claims.conversation_id,
        account_id: claims.account_id
      }
    });

  } catch (error) {
    console.error('Error fetching booking page data:', error);
    res.status(500).json({
      error: 'Failed to load booking page',
      message: error.message
    });
  }
});

/**
 * POST /offers/orders
 * Create a Duffel order (finalize booking)
 *
 * Body:
 * {
 *   token: "eyJhbGc...",
 *   passengers: [
 *     {
 *       type: "adult",
 *       given_name: "John",
 *       family_name: "Doe",
 *       born_on: "1990-01-01",
 *       gender: "m",
 *       email: "john@example.com",
 *       phone_number: "+1234567890"
 *     }
 *   ],
 *   payment_intent_id: "pi_..." // Stripe payment intent (optional for now)
 * }
 *
 * Returns: { order_id, booking_reference, status }
 */
router.post('/orders', async (req, res) => {
  try {
    const { token, passengers, payment_intent_id } = req.body;

    if (!token || !passengers || passengers.length === 0) {
      return res.status(400).json({
        error: 'Token and passengers are required'
      });
    }

    // Verify token
    let claims;
    try {
      claims = tokenService.verifyBookingToken(token);
    } catch (error) {
      return res.status(401).json({
        error: 'Invalid or expired booking link',
        message: error.message
      });
    }

    // Get booking link from database
    const bookingLink = await getBookingLinkByJti(claims.jti);

    if (!bookingLink) {
      return res.status(404).json({
        error: 'Booking link not found'
      });
    }

    // Check if already consumed
    if (bookingLink.status === 'consumed') {
      return res.status(409).json({
        error: 'This booking link has already been used'
      });
    }

    // Check if expired
    if (bookingLink.status === 'expired' || new Date(bookingLink.expires_at) < new Date()) {
      return res.status(410).json({
        error: 'This booking link has expired. Please request a new one.'
      });
    }

    // Get offer details for total amount
    const offer = await duffelOffers.getOffer(bookingLink.offer_id);

    // Create Duffel order
    const order = await duffelOffers.createOrder({
      offer_id: bookingLink.offer_id,
      passengers,
      total_amount: offer.total_amount,
      total_currency: offer.total_currency,
      metadata: {
        conversation_id: claims.conversation_id,
        account_id: claims.account_id,
        booking_link_id: bookingLink.id,
        payment_intent_id: payment_intent_id || null
      }
    });

    // Mark booking link as consumed
    await updateBookingLinkStatus(claims.jti, 'consumed');

    // Store booking in database
    const firstSlice = order.slices?.[0];
    const firstSegment = firstSlice?.segments?.[0];
    const passenger = order.passengers?.[0];

    const bookingData = {
      linkSessionId: null, // Not using Duffel Links anymore
      conversationId: claims.conversation_id || null,
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

    const booking = await createBooking(bookingData);

    console.log('✅ Order created:', {
      order_id: order.id,
      booking_reference: order.booking_reference,
      booking_id: booking.id
    });

    // Log event
    await logEvent('order_created_via_custom_link', 'booking', booking.id, {
      order_id: order.id,
      booking_link_id: bookingLink.id,
      conversation_id: claims.conversation_id
    });

    res.json({
      success: true,
      order_id: order.id,
      booking_reference: order.booking_reference,
      booking_id: booking.id,
      status: order.booking_status,
      total_amount: order.total_amount,
      total_currency: order.total_currency
    });

  } catch (error) {
    console.error('Error creating order:', error);

    // Return appropriate error
    if (error.message.includes('expired')) {
      return res.status(410).json({
        error: 'Offer expired',
        message: error.message
      });
    }

    if (error.message.includes('price')) {
      return res.status(409).json({
        error: 'Price changed',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create booking',
      message: error.message
    });
  }
});

module.exports = router;
