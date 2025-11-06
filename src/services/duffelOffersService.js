/**
 * Duffel Offers Service
 * Handles flight search using Duffel Flights API (Offers → Orders)
 * Replaces Duffel Links with custom booking flow
 */

const { duffel, handleDuffelError } = require('./duffelClient');
const { logEvent } = require('../db/queries');

/**
 * Calculate booking fee (2% with $10 minimum)
 * @param {number} totalAmount - Flight total amount
 * @returns {number} Fee amount
 */
function calculateFee(totalAmount) {
  return Math.max(totalAmount * 0.02, 10);
}

/**
 * Create an offer request and search for flights
 * @param {Object} params - Search parameters
 * @param {string} params.origin - Origin airport IATA code
 * @param {string} params.destination - Destination airport IATA code
 * @param {string} params.departure_date - Departure date (YYYY-MM-DD)
 * @param {string} params.return_date - Return date (optional, for round trips)
 * @param {number} params.passengers - Number of passengers (default: 1)
 * @param {string} params.cabin_class - Cabin class (economy, premium_economy, business, first)
 * @param {string} params.conversationId - Conversation UUID for logging
 * @returns {Promise<Array>} Array of offers
 */
async function searchFlights(params) {
  try {
    const {
      origin,
      destination,
      departure_date,
      return_date,
      passengers = 1,
      cabin_class = 'economy',
      conversationId
    } = params;

    console.log('🔍 Searching flights:', {
      origin,
      destination,
      departure_date,
      return_date,
      passengers,
      cabin_class
    });

    // Build slices (flight segments)
    const slices = [
      {
        origin,
        destination,
        departure_date
      }
    ];

    // Add return slice if round trip
    if (return_date) {
      slices.push({
        origin: destination,
        destination: origin,
        departure_date: return_date
      });
    }

    // Build passengers array
    const passengersList = Array(passengers).fill({ type: 'adult' });

    // Create offer request
    const offerRequest = await duffel.offerRequests.create({
      slices,
      passengers: passengersList,
      cabin_class,
      return_offers: false // We'll handle pagination if needed
    });

    console.log('✅ Offer request created:', offerRequest.data.id);

    // Log search event
    if (conversationId) {
      try {
        await logEvent('flight_search', 'offer_request', offerRequest.data.id, {
          conversation_id: conversationId,
          search_params: params,
          offer_request_id: offerRequest.data.id
        });
      } catch (logError) {
        console.warn('⚠️ Could not log event:', logError.message);
      }
    }

    // Get offers from the request
    const offers = offerRequest.data.offers || [];

    console.log(`📋 Found ${offers.length} offers`);

    // Format offers for easier consumption
    const formattedOffers = offers.map((offer) => formatOffer(offer));

    return formattedOffers;

  } catch (error) {
    console.error('❌ Flight search failed:', error);
    throw new Error(handleDuffelError(error, 'Flight search'));
  }
}

/**
 * Get a specific offer by ID
 * @param {string} offerId - Duffel Offer ID
 * @returns {Promise<Object>} Offer details
 */
async function getOffer(offerId) {
  try {
    console.log('🔍 Fetching offer:', offerId);

    const offer = await duffel.offers.get(offerId);

    console.log('✅ Offer retrieved:', {
      id: offer.data.id,
      total: offer.data.total_amount,
      currency: offer.data.total_currency
    });

    return formatOffer(offer.data);

  } catch (error) {
    console.error('❌ Failed to get offer:', error);
    throw new Error(handleDuffelError(error, 'Get offer'));
  }
}

/**
 * Create a Duffel order (book the flight)
 * @param {Object} params - Order parameters
 * @param {string} params.offer_id - Selected offer ID
 * @param {Array} params.passengers - Passenger details
 * @param {Object} params.metadata - Order metadata (conversation_id, etc)
 * @returns {Promise<Object>} Created order
 */
async function createOrder(params) {
  try {
    const { offer_id, passengers, metadata } = params;

    console.log('📦 Creating order:', {
      offer_id,
      passenger_count: passengers.length,
      metadata
    });

    // Create the order with Duffel balance payment
    // (In production, you might integrate Stripe for payments)
    const order = await duffel.orders.create({
      selected_offers: [offer_id],
      passengers,
      payments: [
        {
          type: 'balance',
          amount: params.total_amount,
          currency: params.total_currency
        }
      ],
      metadata
    });

    console.log('✅ Order created:', {
      order_id: order.data.id,
      booking_reference: order.data.booking_reference
    });

    // Log order creation
    if (metadata?.conversation_id) {
      try {
        await logEvent('order_created', 'order', order.data.id, {
          conversation_id: metadata.conversation_id,
          offer_id,
          booking_reference: order.data.booking_reference
        });
      } catch (logError) {
        console.warn('⚠️ Could not log event:', logError.message);
      }
    }

    return order.data;

  } catch (error) {
    console.error('❌ Order creation failed:', error);

    // Check for specific error types
    if (error.message?.includes('expired')) {
      throw new Error('This flight offer has expired. Please search again for current prices.');
    }

    if (error.message?.includes('price')) {
      throw new Error('The price has changed. Please review the new price before booking.');
    }

    throw new Error(handleDuffelError(error, 'Create order'));
  }
}

/**
 * Format offer data for easier consumption
 * @param {Object} offer - Raw Duffel offer
 * @returns {Object} Formatted offer
 */
function formatOffer(offer) {
  const firstSlice = offer.slices?.[0];
  const firstSegment = firstSlice?.segments?.[0];
  const lastSegment = firstSlice?.segments?.[firstSlice.segments.length - 1];

  // Calculate fee
  const totalAmount = parseFloat(offer.total_amount);
  const fee = calculateFee(totalAmount);
  const totalWithFee = totalAmount + fee;

  return {
    id: offer.id,
    total_amount: totalAmount,
    total_currency: offer.total_currency,
    fee_amount: fee,
    total_with_fee: totalWithFee,

    // Airline and flight info
    owner: {
      name: offer.owner?.name || 'Unknown Airline',
      logo_url: offer.owner?.logo_symbol_url || offer.owner?.logo_lockup_url
    },

    // Departure info
    departure: {
      airport: firstSegment?.origin?.iata_code,
      city: firstSegment?.origin?.city_name,
      time: firstSegment?.departing_at
    },

    // Arrival info
    arrival: {
      airport: lastSegment?.destination?.iata_code,
      city: lastSegment?.destination?.city_name,
      time: lastSegment?.arriving_at
    },

    // Duration and stops
    duration: firstSlice?.duration,
    stops: firstSlice?.segments?.length - 1 || 0,

    // Cabin class
    cabin_class: offer.slices?.[0]?.segments?.[0]?.passengers?.[0]?.cabin_class_marketing_name || 'Economy',

    // Availability
    available_seats: offer.available_services || null,

    // Conditions
    conditions: {
      refundable: offer.conditions?.refund_before_departure?.allowed || false,
      changeable: offer.conditions?.change_before_departure?.allowed || false
    },

    // Full slice data for detailed display
    slices: offer.slices,

    // Expiration
    expires_at: offer.expires_at,

    // Raw offer (for order creation)
    _raw: offer
  };
}

/**
 * Format offers for SMS display
 * @param {Array} offers - Array of formatted offers
 * @param {number} limit - Number of offers to include (default: 3)
 * @returns {string} SMS message
 */
function formatOffersSMS(offers, limit = 3) {
  if (!offers || offers.length === 0) {
    return 'No flights found for your search. Try different dates or airports.';
  }

  const topOffers = offers.slice(0, limit);

  let message = `✈️ Found ${offers.length} flight${offers.length > 1 ? 's' : ''}\n\n`;

  topOffers.forEach((offer, index) => {
    message += `${index + 1}. ${offer.owner.name}\n`;
    message += `   ${offer.departure.airport} → ${offer.arrival.airport}\n`;
    message += `   ${offer.stops === 0 ? 'Nonstop' : `${offer.stops} stop${offer.stops > 1 ? 's' : ''}`}\n`;
    message += `   ${offer.total_currency} ${offer.total_with_fee.toFixed(2)} (incl. fee)\n\n`;
  });

  message += `Book your flight at the link we're sending you!`;

  return message;
}

module.exports = {
  searchFlights,
  getOffer,
  createOrder,
  formatOffer,
  formatOffersSMS,
  calculateFee
};
