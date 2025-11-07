/**
 * Duffel Flight Search Service
 *
 * Handles flight search using Duffel API's offer requests.
 * Fetches live flight offers and extracts relevant flight data.
 */

const axios = require('axios');
const dayjs = require('dayjs');

const DUFFEL_API_BASE = 'https://api.duffel.com';
const DUFFEL_ACCESS_TOKEN = process.env.DUFFEL_ACCESS_TOKEN;

/**
 * Create a Duffel offer request for flight search
 *
 * @param {Object} searchParams - Flight search parameters
 * @param {string} searchParams.origin - Origin airport code (IATA)
 * @param {string} searchParams.destination - Destination airport code (IATA)
 * @param {string} searchParams.departure - Departure date (YYYY-MM-DD)
 * @param {string} searchParams.returnDate - Return date (YYYY-MM-DD), optional
 * @param {number} searchParams.passengers - Number of passengers
 * @param {string} searchParams.cabin - Cabin class (economy, premium_economy, business, first)
 * @returns {Promise<Object>} - Offer request response
 */
async function createOfferRequest(searchParams) {
  const { origin, destination, departure, returnDate, passengers = 1, cabin = 'economy' } = searchParams;

  if (!DUFFEL_ACCESS_TOKEN) {
    throw new Error('DUFFEL_ACCESS_TOKEN not configured');
  }

  // Build slices (legs of the journey)
  const slices = [
    {
      origin,
      destination,
      departure_date: departure
    }
  ];

  // Add return slice if round trip
  if (returnDate) {
    slices.push({
      origin: destination,
      destination: origin,
      departure_date: returnDate
    });
  }

  // Build passengers array
  const passengersArray = Array(passengers).fill({ type: 'adult' });

  // Create offer request payload
  const payload = {
    data: {
      slices,
      passengers: passengersArray,
      cabin_class: cabin,
      max_connections: 2 // Allow up to 2 connections
    }
  };

  try {
    const response = await axios.post(
      `${DUFFEL_API_BASE}/air/offer_requests`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${DUFFEL_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'Duffel-Version': 'v2',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    return response.data;
  } catch (error) {
    console.error('Duffel offer request failed:', error.response?.data || error.message);
    throw new Error(`Failed to search flights: ${error.response?.data?.errors?.[0]?.message || error.message}`);
  }
}

/**
 * Get offers from an offer request
 *
 * @param {string} offerRequestId - Offer request ID from createOfferRequest
 * @returns {Promise<Object[]>} - Array of flight offers
 */
async function getOffers(offerRequestId) {
  if (!DUFFEL_ACCESS_TOKEN) {
    throw new Error('DUFFEL_ACCESS_TOKEN not configured');
  }

  try {
    const response = await axios.get(
      `${DUFFEL_API_BASE}/air/offers?offer_request_id=${offerRequestId}`,
      {
        headers: {
          'Authorization': `Bearer ${DUFFEL_ACCESS_TOKEN}`,
          'Duffel-Version': 'v2',
          'Accept': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.data || [];
  } catch (error) {
    console.error('Failed to get Duffel offers:', error.response?.data || error.message);
    throw new Error(`Failed to retrieve offers: ${error.response?.data?.errors?.[0]?.message || error.message}`);
  }
}

/**
 * Search flights and return top offers
 *
 * @param {Object} searchParams - Flight search parameters
 * @param {number} limit - Maximum number of offers to return (default: 3)
 * @returns {Promise<Object[]>} - Array of processed flight offers
 */
async function searchFlights(searchParams, limit = 3) {
  // Create offer request
  const offerRequest = await createOfferRequest(searchParams);
  const offerRequestId = offerRequest.data.id;

  console.log(`Created Duffel offer request: ${offerRequestId}`);

  // Wait briefly for offers to be generated
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get offers
  const offers = await getOffers(offerRequestId);

  console.log(`Retrieved ${offers.length} offers from Duffel`);

  // Process and sort offers
  const processedOffers = offers
    .map(offer => processOffer(offer))
    .sort((a, b) => {
      // Sort by price first, then by total duration
      if (a.totalAmount !== b.totalAmount) {
        return a.totalAmount - b.totalAmount;
      }
      return a.totalDuration - b.totalDuration;
    })
    .slice(0, limit);

  return processedOffers;
}

/**
 * Process a raw Duffel offer into a simplified format
 *
 * @param {Object} offer - Raw Duffel offer
 * @returns {Object} - Processed offer
 */
function processOffer(offer) {
  const {
    id,
    owner,
    total_amount,
    total_currency,
    slices,
    passengers
  } = offer;

  // Extract airline information
  const airline = {
    code: owner.iata_code,
    name: owner.name,
    logo: owner.logo_symbol_url
  };

  // Process slices (legs)
  const legs = slices.map(slice => processSlice(slice));

  // Calculate total duration
  const totalDuration = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);

  // Format duration
  const durationFormatted = formatDuration(totalDuration);

  return {
    offerId: id,
    airline,
    totalAmount: parseFloat(total_amount),
    currency: total_currency,
    legs,
    totalDuration,
    durationFormatted,
    passengerCount: passengers.length,
    stops: legs[0].stops // Outbound stops
  };
}

/**
 * Process a slice (leg) of a journey
 *
 * @param {Object} slice - Raw Duffel slice
 * @returns {Object} - Processed slice
 */
function processSlice(slice) {
  const { segments, origin, destination, duration } = slice;

  // Get departure and arrival info from first and last segments
  const firstSegment = segments[0];
  const lastSegment = segments[segments.length - 1];

  const departure = {
    airport: origin.iata_code,
    city: origin.city_name,
    time: firstSegment.departing_at,
    timeFormatted: formatTime(firstSegment.departing_at)
  };

  const arrival = {
    airport: destination.iata_code,
    city: destination.city_name,
    time: lastSegment.arriving_at,
    timeFormatted: formatTime(lastSegment.arriving_at)
  };

  // Calculate stops
  const stops = segments.length - 1;

  // Parse ISO 8601 duration (e.g., "PT10H30M")
  const durationMinutes = parseDuration(duration);

  return {
    departure,
    arrival,
    stops,
    durationMinutes,
    durationFormatted: formatDuration(durationMinutes),
    segments: segments.map(seg => ({
      airline: {
        code: seg.operating_carrier.iata_code,
        name: seg.operating_carrier.name
      },
      flightNumber: seg.operating_carrier_flight_number,
      aircraft: seg.aircraft?.name,
      departure: {
        airport: seg.origin.iata_code,
        time: seg.departing_at
      },
      arrival: {
        airport: seg.destination.iata_code,
        time: seg.arriving_at
      }
    }))
  };
}

/**
 * Parse ISO 8601 duration to minutes
 *
 * @param {string} duration - ISO 8601 duration (e.g., "PT10H30M")
 * @returns {number} - Duration in minutes
 */
function parseDuration(duration) {
  if (!duration) return 0;

  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);

  const hours = hoursMatch ? parseInt(hoursMatch[1], 10) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;

  return hours * 60 + minutes;
}

/**
 * Format duration in minutes to human-readable string
 *
 * @param {number} minutes - Duration in minutes
 * @returns {string} - Formatted duration (e.g., "10h 30m")
 */
function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
}

/**
 * Format ISO timestamp to human-readable time
 *
 * @param {string} timestamp - ISO timestamp
 * @returns {string} - Formatted time (e.g., "10:30 AM")
 */
function formatTime(timestamp) {
  return dayjs(timestamp).format('h:mm A');
}

/**
 * Format date to human-readable format
 *
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {string} - Formatted date (e.g., "Mon, Jan 15")
 */
function formatDate(date) {
  return dayjs(date).format('ddd, MMM D');
}

module.exports = {
  createOfferRequest,
  getOffers,
  searchFlights,
  processOffer,
  formatDuration,
  formatTime,
  formatDate
};
