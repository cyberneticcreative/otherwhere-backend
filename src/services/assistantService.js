const OpenAI = require('openai');
const travelPayoutsService = require('./travelPayoutsService');
const airportResolverService = require('./airportResolverService');
const airbnbService = require('./airbnbService');
const hotelsService = require('./hotelsService');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

class AssistantService {
  /**
   * Create a new thread for a conversation
   * @returns {Promise<string>} Thread ID
   */
  async createThread() {
    try {
      const thread = await openai.beta.threads.create();
      console.log(`🧵 Created new thread: ${thread.id}`);
      return thread.id;
    } catch (error) {
      console.error('Failed to create thread:', error);
      throw new Error('Failed to create conversation thread');
    }
  }

  /**
   * Send a message to the assistant and get a response
   * @param {string} threadId - Thread ID for the conversation
   * @param {string} userMessage - User's message
   * @param {Object} options - Additional options
   * @param {Object} options.sessionContext - Session context (lastFlightSearch, lastAccommodationSearch, etc.)
   * @returns {Promise<Object>} Response object with text and metadata
   */
  async sendMessage(threadId, userMessage, options = {}) {
    if (!ASSISTANT_ID) {
      throw new Error('OpenAI Assistant ID not configured');
    }

    try {
      // Build context message if we have session context
      let contextMessage = '';
      if (options.sessionContext) {
        const { lastFlightSearch, lastAccommodationSearch } = options.sessionContext;

        if (lastFlightSearch && lastFlightSearch.startDate) {
          contextMessage += `\n\n[CONTEXT: User just searched for flights from ${lastFlightSearch.origin} to ${lastFlightSearch.destination} for ${lastFlightSearch.startDate}`;
          if (lastFlightSearch.endDate) {
            contextMessage += ` to ${lastFlightSearch.endDate}`;
          }
          contextMessage += `. If they're asking about accommodations, use these same dates unless they specify different ones.]`;
        }

        if (lastAccommodationSearch && lastAccommodationSearch.checkIn) {
          contextMessage += `\n\n[CONTEXT: User previously searched accommodations for ${lastAccommodationSearch.checkIn} to ${lastAccommodationSearch.checkOut}]`;
        }
      }

      // Add user message to thread (with context if available)
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: userMessage + contextMessage
      });

      console.log(`💬 Added message to thread ${threadId}${contextMessage ? ' (with context)' : ''}`);

      // Create a run
      const run = await openai.beta.threads.runs.create(threadId, {
        assistant_id: ASSISTANT_ID
      });

      console.log(`🏃 Started run ${run.id}`);

      // Poll for completion and handle function calls
      const { run: completedRun, tripSearchData, flightResults, accommodationResults } = await this.waitForRunCompletion(threadId, run.id);

      // Get the assistant's response
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: 'desc',
        limit: 1
      });

      const assistantMessage = messages.data[0];

      if (!assistantMessage || assistantMessage.role !== 'assistant') {
        throw new Error('No assistant response found');
      }

      // Extract text content
      const textContent = assistantMessage.content
        .filter(content => content.type === 'text')
        .map(content => content.text.value)
        .join('\n');

      console.log(`✅ Assistant response received (${textContent.length} chars)`);

      return {
        text: textContent || 'Let me help you with that...',
        tripSearch: tripSearchData, // This comes from function calling
        flightResults: flightResults, // This contains actual flight data from Google Flights
        accommodationResults: accommodationResults, // This contains actual accommodation data from Airbnb
        threadId: threadId,
        runId: completedRun.id
      };

    } catch (error) {
      console.error('Assistant API Error:', error);
      throw new Error('Failed to get response from assistant');
    }
  }

  /**
   * Poll for run completion and handle function calls
   * @param {string} threadId - Thread ID
   * @param {string} runId - Run ID
   * @param {number} maxAttempts - Maximum polling attempts
   * @returns {Promise<Object>} Completed run object with tripSearchData if applicable
   */
  async waitForRunCompletion(threadId, runId, maxAttempts = 60) {
    let tripSearchData = null;
    let flightResults = null;
    let accommodationResults = null;
    const pollStartTime = Date.now();

    for (let i = 0; i < maxAttempts; i++) {
      const run = await openai.beta.threads.runs.retrieve(threadId, runId);

      if (run.status === 'completed') {
        const pollDuration = Date.now() - pollStartTime;
        console.log(`⏱️  Assistant polling completed in ${pollDuration}ms after ${i + 1} attempts`);
        return { run, tripSearchData, flightResults, accommodationResults };
      }

      if (run.status === 'requires_action') {
        // Handle function calling
        const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];

        if (toolCalls.length > 0) {
          console.log(`🔧 Handling ${toolCalls.length} function call(s)`);

          const toolOutputs = [];

          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'search_trips') {
              // Extract the function arguments
              const args = JSON.parse(toolCall.function.arguments);
              console.log(`🔍 search_trips called with:`, args);

              // Extract cabin class if provided (economy, premium_economy, business, first)
              const cabinClass = args.cabin_class || args.cabinClass || 'economy';

              // Fix dates if they're in the past (smart correction)
              const fixPastDate = (dateStr) => {
                if (!dateStr) return null;

                const inputDate = new Date(dateStr);
                const now = new Date();

                // If date is in the future, use it as-is
                if (inputDate > now) {
                  return dateStr;
                }

                // Date is in the past - need to correct it
                // Extract month and day from the input date
                const month = inputDate.getMonth(); // 0-11
                const day = inputDate.getDate();
                const currentYear = now.getFullYear();

                // Try current year first
                const currentYearDate = new Date(currentYear, month, day);

                if (currentYearDate > now) {
                  // The date hasn't happened yet this year - use current year
                  const correctedDate = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (this year)`);
                  return correctedDate;
                } else {
                  // The date already passed this year - use next year
                  const nextYear = currentYear + 1;
                  const correctedDate = `${nextYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (next year)`);
                  return correctedDate;
                }
              };

              const correctedCheckIn = fixPastDate(args.check_in);
              const correctedCheckOut = fixPastDate(args.check_out);

              // Check if dates are too far in the future (warn but don't block)
              let dateWarning = '';
              if (correctedCheckIn) {
                const checkInDate = new Date(correctedCheckIn);
                const now = new Date();
                const tenMonthsFromNow = new Date(now.getFullYear(), now.getMonth() + 10, now.getDate());

                if (checkInDate > tenMonthsFromNow) {
                  const monthsAway = Math.round((checkInDate - now) / (1000 * 60 * 60 * 24 * 30));
                  dateWarning = `Note: Your travel date is ${monthsAway} months away. Flight availability may be limited for dates that far in advance. `;
                  console.log(`⚠️ Date warning: Search is ${monthsAway} months in the future`);
                }
              }

              // Store trip search data
              tripSearchData = {
                destination: args.destination,
                origin: args.origin || 'LAX',
                startDate: correctedCheckIn,
                endDate: correctedCheckOut,
                travelers: args.travelers || 1,
                budget: args.budget_usd ? {
                  amount: args.budget_usd,
                  currency: 'USD'
                } : null
              };

              // SEARCH FLIGHTS using Aviasales/TravelPayouts API
              try {
                const flightSearchStart = Date.now();
                console.log('🛫 Searching flights via Aviasales/TravelPayouts API...');

                // Resolve city names to IATA airport codes
                let originCode, destCode;
                try {
                  originCode = travelPayoutsService.extractCityCode(tripSearchData.origin);
                  destCode = travelPayoutsService.extractCityCode(tripSearchData.destination);
                  console.log(`[TravelPayouts] ${tripSearchData.origin} → ${originCode}, ${tripSearchData.destination} → ${destCode}`);
                } catch (resolveError) {
                  throw new Error(`${resolveError.message} Please specify a major city or 3-letter airport code.`);
                }

                // Search flights using Aviasales/TravelPayouts
                const searchResults = await travelPayoutsService.searchFlights({
                  origin: originCode,
                  destination: destCode,
                  startDate: tripSearchData.startDate,
                  endDate: tripSearchData.endDate,
                  travelers: parseInt(tripSearchData.travelers) || 1,
                  travelClass: cabinClass,
                  budget: tripSearchData.budget
                });

                console.log(`✈️  Searching ${cabinClass} class flights`);

                if (!searchResults.success || searchResults.flights.length === 0) {
                  throw new Error('No flights found for your search');
                }

                // Store flight results for SMS handler (will use whitelabel booking link)
                flightResults = {
                  flights: searchResults.flights,
                  originCode: originCode,
                  destCode: destCode,
                  searchParams: {
                    outboundDate: tripSearchData.startDate,
                    returnDate: tripSearchData.endDate,
                    passengers: parseInt(tripSearchData.travelers) || 1,
                    cabinClass: cabinClass,
                    currency: tripSearchData.budget?.currency || 'USD'
                  }
                };

                // Format message for assistant
                const bestFlight = searchResults.flights[0];
                const stops = bestFlight.transfers;
                // Only show stops info if we have reliable data (not null/undefined)
                const stopsInfo = stops !== null && stops !== undefined
                  ? ` ${stops === 0 ? '(Direct)' : `(${stops} stop${stops > 1 ? 's' : ''})`}`
                  : '';
                const resultsMessage = `${dateWarning}Perfect! I found ${searchResults.flights.length} flights from ${tripSearchData.origin} to ${tripSearchData.destination}. Best option: ${bestFlight.airline || 'Various airlines'} for $${Math.round(bestFlight.priceValue)}${stopsInfo}. Check your texts for all options with booking link!`;

                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: true,
                    message: resultsMessage,
                    flightCount: searchResults.flights.length,
                    bestPrice: Math.round(bestFlight.priceValue),
                    airline: bestFlight.airline || 'Various'
                  })
                });

                const flightSearchDuration = Date.now() - flightSearchStart;
                console.log(`✅ Found ${searchResults.flights.length} flights via Aviasales in ${flightSearchDuration}ms`);

              } catch (error) {
                console.error('❌ Aviasales flight search error:', error.message);

                // Return error to assistant
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: false,
                    message: 'Unable to find flights at the moment. Please try different cities or dates, or check the spelling of city names.'
                  })
                });
              }
            } else if (toolCall.function.name === 'search_accommodations') {
              // Extract the function arguments
              const args = JSON.parse(toolCall.function.arguments);
              console.log(`🔍 search_accommodations called with:`, args);

              // Fix dates if they're in the past (smart correction)
              const fixPastDate = (dateStr) => {
                if (!dateStr) return null;

                const inputDate = new Date(dateStr);
                const now = new Date();

                if (inputDate > now) {
                  return dateStr;
                }

                const month = inputDate.getMonth();
                const day = inputDate.getDate();
                const currentYear = now.getFullYear();

                const currentYearDate = new Date(currentYear, month, day);

                if (currentYearDate > now) {
                  const correctedDate = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (this year)`);
                  return correctedDate;
                } else {
                  const nextYear = currentYear + 1;
                  const correctedDate = `${nextYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  console.log(`📅 Corrected past date: ${dateStr} → ${correctedDate} (next year)`);
                  return correctedDate;
                }
              };

              const correctedCheckIn = fixPastDate(args.check_in || args.checkIn);
              const correctedCheckOut = fixPastDate(args.check_out || args.checkOut);

              // Determine accommodation type: "airbnb", "hotel", or "both" (default)
              const accommodationType = (args.accommodation_type || args.accommodationType || 'both').toLowerCase();
              console.log(`🏠 Accommodation type preference: "${accommodationType}" (type: ${typeof accommodationType})`);

              // SEARCH FOR ACCOMMODATIONS (Airbnb, Hotels.com, or both)
              try {
                const accommodationSearchStart = Date.now();

                let allProperties = [];
                let destinationName = args.destination;
                let searchType = '';

                // Search Airbnb if requested
                const shouldSearchAirbnb = (accommodationType === 'airbnb' || accommodationType === 'both');
                const shouldSearchHotels = (accommodationType === 'hotel' || accommodationType === 'both');

                console.log(`🔍 Search decisions: Airbnb=${shouldSearchAirbnb}, Hotels=${shouldSearchHotels}`);

                if (shouldSearchAirbnb) {
                  try {
                    console.log('🏠 Calling Airbnb API...');

                    const destinations = await airbnbService.searchDestination(args.destination, 'USA');
                    if (destinations && destinations.length > 0) {
                      const airbnbDestId = destinations[0]?.id;
                      destinationName = destinations[0]?.name || args.destination;

                      const airbnbParams = {
                        destinationId: airbnbDestId,
                        checkIn: correctedCheckIn,
                        checkOut: correctedCheckOut,
                        adults: parseInt(args.guests) || 1,
                        maxPrice: args.budget_per_night_usd || args.budgetPerNight || undefined,
                        currency: 'USD',
                        limit: 10
                      };

                      const airbnbResults = await airbnbService.searchProperties(airbnbParams);
                      const formattedAirbnb = airbnbService.formatPropertyResults(airbnbResults, 5, {
                        privateOnly: true,
                        minRating: 4.0,
                        minReviews: 0
                      });

                      // Tag as Airbnb
                      formattedAirbnb.forEach(prop => prop.source = 'airbnb');
                      allProperties = allProperties.concat(formattedAirbnb);
                      searchType = 'Airbnb';

                      console.log(`✅ Found ${formattedAirbnb.length} Airbnb properties`);
                    }
                  } catch (airbnbError) {
                    console.error('❌ Airbnb search failed:', airbnbError.message);
                  }
                }

                // Search Hotels.com if requested
                if (shouldSearchHotels) {
                  try {
                    console.log('🏨 Calling Hotels.com API...');

                    const regions = await hotelsService.searchRegion(args.destination);
                    if (regions && regions.length > 0) {
                      const hotelLocationId = regions[0]?.id;
                      destinationName = regions[0]?.name || destinationName;

                      const hotelParams = {
                        locationId: hotelLocationId,
                        checkIn: correctedCheckIn,
                        checkOut: correctedCheckOut,
                        adults: parseInt(args.guests) || 1,
                        maxPrice: args.budget_per_night_usd || args.budgetPerNight || undefined,
                        currency: 'USD',
                        limit: 10
                      };

                      const hotelResults = await hotelsService.searchHotels(hotelParams);
                      const formattedHotels = hotelsService.formatHotelResults(hotelResults, 5, {
                        minRating: 3.5,
                        minReviews: 10
                      });

                      // Tag as hotel
                      formattedHotels.forEach(hotel => hotel.source = 'hotel');
                      allProperties = allProperties.concat(formattedHotels);
                      searchType = searchType ? 'Airbnb & Hotels' : 'Hotels';

                      console.log(`✅ Found ${formattedHotels.length} Hotels.com properties`);
                    }
                  } catch (hotelError) {
                    console.error('❌ Hotels.com search failed:', hotelError.message);
                  }
                }

                // If we got no results from either, throw an error
                if (allProperties.length === 0) {
                  throw new Error(`No accommodations found from ${searchType || 'any source'}`);
                }

                // Sort all properties by price (lowest first) and take top 3
                allProperties.sort((a, b) => a.pricePerNight - b.pricePerNight);
                const topProperties = allProperties.slice(0, 3);

                // Re-index to be sequential
                topProperties.forEach((prop, idx) => prop.index = idx + 1);

                // Store formatted results for SMS sending later
                accommodationResults = {
                  properties: topProperties,
                  destinationName,
                  searchParams: {
                    checkIn: correctedCheckIn,
                    checkOut: correctedCheckOut,
                    guests: parseInt(args.guests) || 1
                  },
                  searchType
                };

                // Return accommodation results to the assistant
                const resultsMessage = topProperties.length > 0
                  ? `Found ${topProperties.length} great ${searchType} options! Best: $${topProperties[0].pricePerNight}/night with ${topProperties[0].rating}⭐ rating. Details being sent via SMS.`
                  : `No accommodations found for these dates. Try different dates or a nearby location.`;

                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: true,
                    message: resultsMessage,
                    propertyCount: topProperties.length,
                    bestPrice: topProperties[0]?.pricePerNight || null,
                    bestRating: topProperties[0]?.rating || null,
                    searchType
                  })
                });

                const accommodationSearchDuration = Date.now() - accommodationSearchStart;
                console.log(`✅ Accommodation search completed: ${topProperties.length} results (${searchType}) in ${accommodationSearchDuration}ms`);

              } catch (error) {
                console.error('❌ Accommodation search error:', error.message);

                // Return error to assistant
                toolOutputs.push({
                  tool_call_id: toolCall.id,
                  output: JSON.stringify({
                    success: false,
                    message: 'Unable to search accommodations at the moment. Please try again or check location name.'
                  })
                });
              }
            }
          }

          // Submit tool outputs
          if (toolOutputs.length > 0) {
            await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
              tool_outputs: toolOutputs
            });
            console.log(`✅ Submitted ${toolOutputs.length} tool output(s)`);
          }
        }
      }

      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }

      // Wait before polling again (faster polling, max 2s instead of 5s)
      // Start at 500ms, increase to 1s, then 2s max
      const waitTime = i < 3 ? 500 : (i < 10 ? 1000 : 2000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    throw new Error('Run timed out waiting for completion');
  }

  /**
   * Get thread messages
   * @param {string} threadId - Thread ID
   * @param {number} limit - Number of messages to retrieve
   * @returns {Promise<Array>} Array of messages
   */
  async getThreadMessages(threadId, limit = 20) {
    try {
      const messages = await openai.beta.threads.messages.list(threadId, {
        order: 'asc',
        limit: limit
      });

      return messages.data.map(msg => ({
        role: msg.role,
        content: msg.content
          .filter(content => content.type === 'text')
          .map(content => content.text.value)
          .join('\n'),
        timestamp: msg.created_at
      }));
    } catch (error) {
      console.error('Failed to get thread messages:', error);
      return [];
    }
  }

  /**
   * Delete a thread
   * @param {string} threadId - Thread ID to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteThread(threadId) {
    try {
      await openai.beta.threads.del(threadId);
      console.log(`🗑️  Deleted thread ${threadId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete thread:', error);
      return false;
    }
  }

  /**
   * Check if assistant is configured
   * @returns {boolean} True if configured
   */
  isConfigured() {
    return !!(process.env.OPENAI_API_KEY && ASSISTANT_ID);
  }

  /**
   * Get assistant details
   * @returns {Promise<Object>} Assistant object
   */
  async getAssistantDetails() {
    if (!ASSISTANT_ID) {
      throw new Error('Assistant ID not configured');
    }

    try {
      const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
      return {
        id: assistant.id,
        name: assistant.name,
        model: assistant.model,
        instructions: assistant.instructions
      };
    } catch (error) {
      console.error('Failed to get assistant details:', error);
      throw error;
    }
  }
}

module.exports = new AssistantService();
