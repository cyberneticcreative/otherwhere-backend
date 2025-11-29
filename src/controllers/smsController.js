const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const assistantService = require('../services/assistantService');
const sessionManager = require('../services/sessionManager');
const travelPayoutsService = require('../services/travelPayoutsService');
const airbnbService = require('../services/airbnbService');
const staysService = require('../services/staysService');
const userProfileService = require('../services/userProfileService');
const userPreferencesService = require('../services/userPreferencesService');
const conversationExtractor = require('../services/conversationExtractor');
const recommendationService = require('../services/recommendationService');

class SMSController {
  /**
   * Handle inbound SMS messages from Twilio
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleInboundSMS(req, res) {
    const startTime = Date.now();
    try {
      const { From: from, Body: body, MessageSid: messageSid } = req.body;

      console.log(`📱 Inbound SMS from ${from}: "${body}"`);
      console.log(`⏱️  Request start: ${new Date().toISOString()}`);

      // Get or create session
      let session = await sessionManager.getSession(from);
      await sessionManager.updateSession(from, { channel: 'sms' });

      // Create user profile in PostgreSQL if new user (SMS-first onboarding)
      if (!session.onboardedVia) {
        try {
          await userProfileService.getOrCreateUser(from, {
            onboardedVia: 'sms'
          });
          await sessionManager.updateSession(from, { onboardedVia: 'sms' });
          console.log(`📱 User profile created in database for ${from}`);
        } catch (dbError) {
          console.warn(`Database operation failed:`, dbError.message);
        }
      }

      // Load user preferences from database if not already in session
      if (!session.userPreferences) {
        try {
          const prefs = await userPreferencesService.getPreferences(from);
          if (prefs) {
            await sessionManager.updateSession(from, {
              userPreferences: {
                preferredClass: prefs.preferred_class,
                preferredAirlines: prefs.preferred_airlines,
                avoidedAirlines: prefs.avoided_airlines,
                preferredAirports: prefs.preferred_airports,
                avoidedAirports: prefs.avoided_airports,
                departureTimePreference: prefs.departure_time_preference,
                maxStops: prefs.max_stops,
                connectionPreference: prefs.connection_preference,
                budgetFlexibility: prefs.budget_flexibility
              }
            });
            console.log(`📋 Loaded user preferences from database for ${from}`);
          }
        } catch (prefError) {
          console.warn(`Could not load preferences:`, prefError.message);
        }
      }

      // Re-fetch session to get latest data (in case it was updated by flight results)
      session = await sessionManager.getSession(from);

      // Check for reset/start over command
      const resetTriggers = ['reset', 'start over', 'restart', 'new search'];
      const isResetCommand = resetTriggers.some(trigger =>
        body.toLowerCase().includes(trigger)
      );

      if (isResetCommand) {
        console.log(`🔄 User requested reset`);
        await sessionManager.clearSession(from);
        await twilioService.sendSMS(
          from,
          "Sure! Let's start fresh. Where would you like to go?"
        );

        res.type('text/xml');
        res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
        return;
      }

      // ========================================
      // RECOMMENDATION MODE HANDLING
      // Check if user is in reco mode or should enter it
      // This is a PRE-BOOKING flow for destination discovery
      // ========================================
      const recoResult = await this.handleRecommendationMode(from, body, session, res);
      if (recoResult.handled) {
        // Recommendation mode handled the message, exit early
        const totalDuration = Date.now() - startTime;
        console.log(`⏱️  TOTAL request time (reco mode): ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);
        return;
      }
      // If recoResult.destination is set, user selected a destination from recommendations
      // Continue to normal flow with this destination in mind
      if (recoResult.destination) {
        console.log(`🎯 User selected destination from recommendations: ${recoResult.destination}`);
        // The session has been updated with the destination, normal flow will pick it up
      }

      // Debug: Log session state
      console.log(`🔍 Session check - lastAccommodationResults: ${!!session.lastAccommodationResults}`);

      // Check if user is selecting a number (1, 2, or 3) for accommodation
      // Only match if the ENTIRE message is exactly "1", "2", or "3"
      // This prevents "Jan 3-18" or "December 1" from triggering
      const isShortMessage = body.trim().length < 15;
      const numberSelection = isShortMessage ? body.trim().match(/^([123])$/) : null;
      console.log(`🔍 Number selection check - matched: ${!!numberSelection}, short: ${isShortMessage}, body: "${body}"`);

      // Handle accommodation selection (flights now handled via Duffel Links)
      if (numberSelection && session.lastAccommodationResults) {
        // Handle accommodation selection
        const selectedIndex = parseInt(numberSelection[1]) - 1;
        const selectedProperty = session.lastAccommodationResults[selectedIndex];

        if (selectedProperty) {
          console.log(`🏠 User selected accommodation #${numberSelection[1]}, generating booking URL...`);

          // Generate Airbnb URL
          const bookingUrl = selectedProperty.url;

          // Calculate total cost if dates available
          let costInfo = '';
          if (session.lastAccommodationSearch?.checkIn && session.lastAccommodationSearch?.checkOut) {
            const costBreakdown = airbnbService.calculateTotalCost(
              selectedProperty.pricePerNight,
              session.lastAccommodationSearch.checkIn,
              session.lastAccommodationSearch.checkOut
            );

            costInfo = `\n${costBreakdown.nights} nights = $${costBreakdown.subtotal}\n${costBreakdown.feesNote}`;
          }

          const bookingMessage = bookingUrl
            ? `Great choice! 🏠\n\n${selectedProperty.name}\n$${selectedProperty.pricePerNight}/night ⭐${selectedProperty.rating}${costInfo}\n\n🔗 Book here: ${bookingUrl}`
            : `Great choice! 🏠\n\n${selectedProperty.name}\n$${selectedProperty.pricePerNight}/night ⭐${selectedProperty.rating}${costInfo}\n\nPlease search on Airbnb for this property.`;

          await twilioService.sendSMS(from, bookingMessage);

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

          const totalDuration = Date.now() - startTime;
          console.log(`⏱️  TOTAL request time: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);
          return;
        }
      }

      // Check if user is requesting a flight time preference change after seeing flight results
      // This handles messages like "afternoon", "later", "morning flight", "evening departure", etc.
      if (session.lastFlightResults && session.context?.lastFlightSearch) {
        const bodyLower = body.toLowerCase().trim();
        const timePreferencePatterns = [
          { pattern: /\b(afternoon|after\s*noon|pm\s*flight|later|after\s*12)\b/i, pref: 'afternoon' },
          { pattern: /\b(morning|early|am\s*flight|before\s*noon)\b/i, pref: 'morning' },
          { pattern: /\b(evening|after\s*(work|5|6)|night\s*flight)\b/i, pref: 'evening' },
          { pattern: /\b(red[- ]?eye|overnight|late\s*night)\b/i, pref: 'red_eye' },
          { pattern: /\b(no\s*red[- ]?eye|daytime|avoid\s*overnight)\b/i, pref: 'no_red_eye' },
        ];

        const matchedPref = timePreferencePatterns.find(p => p.pattern.test(bodyLower));

        if (matchedPref) {
          console.log(`⏰ User requesting time preference change: "${bodyLower}" → ${matchedPref.pref}`);

          // Re-search with time preference
          const lastSearch = session.context.lastFlightSearch;
          const responseText = `Got it! Searching for ${matchedPref.pref} flights...`;

          await twilioService.sendSMS(from, responseText);

          // Trigger a new search via the assistant with time preference context
          // Add the preference to the user message so the assistant picks it up
          const enhancedMessage = `I want ${matchedPref.pref} flights. Search again for flights from ${lastSearch.origin} to ${lastSearch.destination} on ${lastSearch.startDate}${lastSearch.endDate ? ' returning ' + lastSearch.endDate : ''} with ${matchedPref.pref} departure times.`;

          // Clear old flight results so new search happens
          await sessionManager.updateSession(from, {
            lastFlightResults: null
          });

          // Continue with enhanced message instead of original
          body = enhancedMessage;
          console.log(`📝 Enhanced message for time preference: "${enhancedMessage}"`);
        }
      }

      // Add user message to conversation history
      await sessionManager.addMessage(from, {
        role: 'user',
        content: body
      });

      // Extract preferences from natural language (runs in background, doesn't block)
      // This parses things like "biz class", "avoid LAX", "I like United", etc.
      this.extractAndSavePreferences(from, body, session).catch(err => {
        console.warn('Preference extraction failed (non-blocking):', err.message);
      });

      // ============================================================
      // ACCOMMODATION INTENT INTERCEPTOR
      // After flight selection, detect "stays" intent and auto-search
      // This prevents the bot from re-asking when user says "stays too please"
      // ============================================================
      if (session.lastFlightSearch && session.context?.lastFlightSearch) {
        const wantsAccommodation = this.detectAccommodationIntent(body);
        const wantsJustFlight = this.detectJustFlightIntent(body);

        if (wantsAccommodation) {
          console.log(`🏠 Detected accommodation intent: "${body}" → triggering search`);

          // Get flight context
          const flightSearch = session.context.lastFlightSearch;
          const destination = flightSearch.destination;
          const checkIn = flightSearch.startDate;
          const checkOut = flightSearch.endDate;
          const guests = flightSearch.travelers || 1;

          // Send momentum message
          await twilioService.sendSMS(from, `Got it — pulling great places to stay near your dates. One sec…`);

          // Trigger accommodation search directly
          try {
            const accommodationResults = await this.searchAccommodations({
              destination,
              checkIn,
              checkOut,
              guests
            });

            if (accommodationResults && accommodationResults.properties && accommodationResults.properties.length > 0) {
              // Create search in stays service
              const searchId = staysService.createSearch({
                phoneNumber: from,
                location: accommodationResults.destinationName,
                checkIn: accommodationResults.searchParams?.checkIn,
                checkOut: accommodationResults.searchParams?.checkOut,
                guests: accommodationResults.searchParams?.guests || guests,
                results: accommodationResults.properties,
                searchParams: accommodationResults.searchParams
              });

              // Store in session
              await sessionManager.updateSession(from, {
                lastAccommodationResults: accommodationResults.properties,
                lastAccommodationSearch: {
                  destination: accommodationResults.destinationName,
                  checkIn: accommodationResults.searchParams?.checkIn,
                  checkOut: accommodationResults.searchParams?.checkOut,
                  searchId: searchId
                }
              });

              // Send frontend link
              const frontendUrl = process.env.FRONTEND_URL || 'https://otherwhere-frontend-production.up.railway.app';
              const staysUrl = `${frontendUrl}/search/${searchId}?phone=${encodeURIComponent(from)}`;

              const formatDate = (dateStr) => {
                if (!dateStr) return '';
                const parts = dateStr.split('-');
                if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
                return dateStr;
              };

              const dateRange = checkIn && checkOut ? ` ${formatDate(checkIn)}-${formatDate(checkOut)}` : '';
              const accommodationMessage = `🏠 Found ${accommodationResults.properties.length} great places in ${accommodationResults.destinationName}${dateRange}!\n\nBrowse & pick your favorite:\n${staysUrl}`;

              await twilioService.sendLongSMS(from, accommodationMessage);
              console.log('✅ Accommodation search completed via intent interceptor');
            } else {
              await twilioService.sendSMS(from, `Hmm, having trouble finding places to stay. Try again in a moment?`);
            }
          } catch (err) {
            console.error('❌ Accommodation search failed:', err.message);
            await twilioService.sendSMS(from, `Having trouble searching accommodations right now. Try again shortly!`);
          }

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          return;
        }

        if (wantsJustFlight) {
          console.log(`✈️ Detected "just flight" intent: "${body}"`);
          await twilioService.sendSMS(from, `All set! Your flight is ready to book. Safe travels! ✈️`);

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          return;
        }
      }

      // Decide whether to use OpenAI Assistant or direct LLM
      const useAssistant = assistantService.isConfigured();

      let responseText;
      let tripSearchData = null;
      let flightResults = null;
      let accommodationResults = null;

      const aiStartTime = Date.now();
      console.log(`🤖 Using ${useAssistant ? 'OpenAI Assistant' : 'Direct LLM'}`);

      if (useAssistant) {
        // Use OpenAI Assistant
        try {
          // Create thread if it doesn't exist
          if (!session.threadId) {
            const threadId = await assistantService.createThread();
            await sessionManager.updateSession(from, { threadId });
            session.threadId = threadId;
          }

          // Send message to assistant with session context and user preferences
          const assistantResponse = await assistantService.sendMessage(
            session.threadId,
            body,
            {
              sessionContext: {
                lastFlightSearch: session.lastFlightSearch,
                lastAccommodationSearch: session.lastAccommodationSearch,
                userPreferences: session.userPreferences
              }
            }
          );

          responseText = assistantResponse.text;
          tripSearchData = assistantResponse.tripSearch;
          flightResults = assistantResponse.flightResults;
          accommodationResults = assistantResponse.accommodationResults;

          const aiDuration = Date.now() - aiStartTime;
          console.log(`⏱️  Assistant took ${aiDuration}ms (${(aiDuration/1000).toFixed(1)}s)`);

        } catch (error) {
          console.error('Assistant error, falling back to LLM:', error);
          // Fall back to LLM
          const llmResponse = await llmService.generateResponse(
            session.conversationHistory,
            body
          );
          responseText = llmResponse.text;
          tripSearchData = llmResponse.tripSearch;
        }
      } else {
        // Use LLM directly
        const llmResponse = await llmService.generateResponse(
          session.conversationHistory,
          body
        );
        responseText = llmResponse.text;
        tripSearchData = llmResponse.tripSearch;

        const aiDuration = Date.now() - aiStartTime;
        console.log(`⏱️  LLM took ${aiDuration}ms (${(aiDuration/1000).toFixed(1)}s)`);
      }

      // Add assistant response to conversation history
      await sessionManager.addMessage(from, {
        role: 'assistant',
        content: responseText
      });

      // Send response via SMS
      const smsStartTime = Date.now();
      await twilioService.sendLongSMS(from, responseText);
      const smsDuration = Date.now() - smsStartTime;
      console.log(`⏱️  SMS send took ${smsDuration}ms`);

      // If we have flight results, send them with whitelabel booking link
      if (flightResults && flightResults.flights && flightResults.flights.length > 0) {
        console.log('✈️ Sending flight results with whitelabel booking link...');

        try {
          // Build whitelabel booking URL
          const tripData = {
            origin: flightResults.originCode,
            destination: flightResults.destCode,
            startDate: flightResults.searchParams?.outboundDate,
            endDate: flightResults.searchParams?.returnDate,
            travelers: flightResults.searchParams?.passengers || 1,
            travelClass: flightResults.searchParams?.cabinClass || 'economy',
            budget: {
              currency: flightResults.searchParams?.currency || 'USD'
            }
          };

          // Get best booking URL (priority: proposal.link > white-label > /go/flights)
          const bookingUrl = travelPayoutsService.getBestBookingURL(flightResults, tripData, from);

          // Check if round-trip (has return date)
          const isRoundTrip = !!flightResults.searchParams?.returnDate;
          const outboundDate = flightResults.searchParams?.outboundDate;
          const returnDate = flightResults.searchParams?.returnDate;

          // Helper to format date as "Jan 4"
          const formatDateShort = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          };

          // Format flight message with booking link
          let flightMessage;

          if (isRoundTrip) {
            // Round-trip bundled format
            flightMessage = `Here are your flight options:\n\n`;

            flightResults.flights.slice(0, 3).forEach((flight, idx) => {
              const priceValue = flight.priceValue !== undefined && flight.priceValue !== null ? flight.priceValue : 0;
              const price = priceValue > 0 ? `$${Math.round(priceValue)} total` : flight.price || 'Search';
              const airline = flight.airline || 'Various';
              const stops = flight.stops !== undefined ? flight.stops : flight.transfers;
              const stopText = stops !== null && stops !== undefined
                ? (stops === 0 ? 'nonstop' : `${stops} stop${stops > 1 ? 's' : ''}`)
                : '';

              flightMessage += `${idx + 1}. ${airline} — ${price}\n`;
              flightMessage += `OUT: ${formatDateShort(outboundDate)}${stopText ? ` (${stopText})` : ''}\n`;
              flightMessage += `RET: ${formatDateShort(returnDate)}${stopText ? ` (${stopText})` : ''}\n\n`;
            });

            flightMessage += `Reply "1" or "2" to choose, or say "show more".\n`;
          } else {
            // One-way format (original)
            flightMessage = `✈️ Found ${flightResults.flights.length} flight${flightResults.flights.length > 1 ? 's' : ''}!\n\n`;

            flightResults.flights.slice(0, 3).forEach((flight, idx) => {
              const priceValue = flight.priceValue !== undefined && flight.priceValue !== null ? flight.priceValue : 0;
              const price = priceValue > 0 ? `$${Math.round(priceValue)}` : flight.price || 'Search';

              flightMessage += `${idx + 1}. ${price}`;
              const stops = flight.stops !== undefined ? flight.stops : flight.transfers;
              if (stops !== null && stops !== undefined) {
                flightMessage += stops === 0 ? ' (Direct)' : ` (${stops} stop${stops > 1 ? 's' : ''})`;
              }

              const airline = flight.airline || 'Various';
              flightMessage += ` - ${airline}\n`;
            });
          }

          flightMessage += `\n🔗 Book: ${bookingUrl}`;

          // Store flight results in session for reference
          await sessionManager.updateSession(from, {
            lastFlightResults: flightResults.flights,
            context: {
              lastFlightSearch: {
                origin: flightResults.originCode,
                destination: flightResults.destCode,
                startDate: flightResults.searchParams?.outboundDate,
                endDate: flightResults.searchParams?.returnDate,
                passengers: flightResults.searchParams?.passengers,
                results: flightResults.flights
              }
            }
          });

          // Send flight results as a second SMS (no delay needed, async send)
          twilioService.sendLongSMS(from, flightMessage)
            .then(() => {
              console.log('✅ Flight results with whitelabel booking link sent');
            })
            .catch((smsError) => {
              console.error('❌ Failed to send flight results SMS:', smsError);
            });

        } catch (error) {
          console.error('❌ Failed to send flight results:', error);

          // Send fallback message
          twilioService.sendSMS(
            from,
            "I found flights but had trouble sending you the details. Please try again or contact support."
          )
            .then(() => {
              console.log('✅ Error fallback SMS sent');
            })
            .catch((smsError) => {
              console.error('❌ Failed to send error message:', smsError);
            });
        }
      }

      // If we have accommodation results, create a search and send frontend link
      if (accommodationResults && accommodationResults.properties && accommodationResults.properties.length > 0) {
        console.log('🏠 Creating stays search and sending frontend link...');

        // Create search in stays service
        const searchId = staysService.createSearch({
          phoneNumber: from,
          location: accommodationResults.destinationName,
          checkIn: accommodationResults.searchParams?.checkIn,
          checkOut: accommodationResults.searchParams?.checkOut,
          guests: accommodationResults.searchParams?.guests || 2,
          results: accommodationResults.properties,
          searchParams: accommodationResults.searchParams
        });

        // Store accommodation results and search details in session
        await sessionManager.updateSession(from, {
          lastAccommodationResults: accommodationResults.properties,
          lastAccommodationSearch: {
            destination: accommodationResults.destinationName,
            checkIn: accommodationResults.searchParams?.checkIn,
            checkOut: accommodationResults.searchParams?.checkOut,
            searchId: searchId
          }
        });
        console.log(`💾 Created search ${searchId} with ${accommodationResults.properties.length} properties`);

        // Get the frontend URL from environment or use default
        const frontendUrl = process.env.FRONTEND_URL || 'https://otherwhere-frontend-production.up.railway.app';
        const staysUrl = `${frontendUrl}/search/${searchId}?phone=${encodeURIComponent(from)}`;

        // Compact date format (MM/DD)
        const formatDate = (dateStr) => {
          if (!dateStr) return '';
          const parts = dateStr.split('-');
          if (parts.length === 3) return `${parts[1]}/${parts[2]}`;
          return dateStr;
        };

        const checkIn = accommodationResults.searchParams?.checkIn;
        const checkOut = accommodationResults.searchParams?.checkOut;
        const dateRange = checkIn && checkOut ? ` ${formatDate(checkIn)}-${formatDate(checkOut)}` : '';

        // Send short message with link to frontend
        const accommodationMessage = `🏠 Found ${accommodationResults.properties.length} great places in ${accommodationResults.destinationName}${dateRange}!\n\nBrowse & pick your favorite:\n${staysUrl}`;

        // Send accommodation link as a second SMS (async)
        twilioService.sendLongSMS(from, accommodationMessage)
          .then(() => {
            console.log('✅ Accommodation link SMS sent');
          })
          .catch((smsError) => {
            console.error('❌ Failed to send accommodation link SMS:', smsError);
          });
      }

      // Send TwiML response to Twilio
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

      const totalDuration = Date.now() - startTime;
      console.log(`⏱️  TOTAL request time: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);

    } catch (error) {
      console.error('Error handling inbound SMS:', error);

      // Try to send error message to user
      try {
        await twilioService.sendSMS(
          req.body.From,
          "I'm having trouble processing your message right now. Please try again in a moment."
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }

      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  }

  /**
   * Handle recommendation mode flow
   * This is a PRE-BOOKING flow for users who don't have a destination in mind
   * @param {string} phoneNumber - User's phone number
   * @param {string} message - User's message
   * @param {Object} session - Current session data
   * @param {Object} res - Express response object
   * @returns {Object} { handled: boolean, destination?: string }
   */
  async handleRecommendationMode(phoneNumber, message, session, res) {
    const sendAndReturn = async (text) => {
      await twilioService.sendSMS(phoneNumber, text);
      res.type('text/xml');
      res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      return { handled: true };
    };

    // Check if already in recommendation mode
    if (session.recoMode) {
      console.log(`🎯 User in reco mode: ${session.recoMode}`);

      switch (session.recoMode) {
        case 'asking_vibe': {
          // Parse vibe response
          const vibe = recommendationService.parseVibeResponse(message);
          await sessionManager.updateSession(phoneNumber, {
            recoMode: 'asking_when',
            recoPreferences: { vibe }
          });
          await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
          await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getWhenQuestion() });
          return sendAndReturn(recommendationService.getWhenQuestion());
        }

        case 'asking_when': {
          const when = recommendationService.parseWhenResponse(message);
          const prefs = session.recoPreferences || {};
          await sessionManager.updateSession(phoneNumber, {
            recoMode: 'asking_budget',
            recoPreferences: { ...prefs, when }
          });
          await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
          await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getBudgetQuestion() });
          return sendAndReturn(recommendationService.getBudgetQuestion());
        }

        case 'asking_budget': {
          const budget = recommendationService.parseBudgetResponse(message);
          const prefs = session.recoPreferences || {};
          await sessionManager.updateSession(phoneNumber, {
            recoMode: 'asking_who',
            recoPreferences: { ...prefs, budget }
          });
          await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
          await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getWhoQuestion() });
          return sendAndReturn(recommendationService.getWhoQuestion());
        }

        case 'asking_who': {
          const who = recommendationService.parseWhoResponse(message);
          const prefs = session.recoPreferences || {};
          const fullPrefs = { ...prefs, who };

          await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });

          // Generate recommendations
          console.log(`🎯 Generating recommendations with preferences:`, fullPrefs);
          const recoResult = await recommendationService.generateRecommendations(fullPrefs);

          const formattedRecos = recommendationService.formatRecommendationsForChannel(recoResult.recommendations);

          await sessionManager.updateSession(phoneNumber, {
            recoMode: 'awaiting_selection',
            recoPreferences: fullPrefs,
            recoRecommendations: recoResult.recommendations
          });

          await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: formattedRecos });

          // Send recommendations (may need to split for SMS length)
          await twilioService.sendLongSMS(phoneNumber, formattedRecos);

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          return { handled: true };
        }

        case 'awaiting_selection': {
          const selection = recommendationService.parseSelection(message, session.recoRecommendations || []);

          if (selection.selected && selection.destination) {
            // User selected a destination - exit reco mode and continue to booking
            const confirmMsg = recommendationService.getSelectionConfirmation(selection.destination);

            // Clear reco mode but preserve the destination
            await sessionManager.updateSession(phoneNumber, {
              recoMode: null,
              recoPreferences: null,
              recoRecommendations: null,
              tripDetails: {
                destination: selection.destination,
                travelers: session.recoPreferences?.who?.count || 1
              },
              context: {
                ...session.context,
                selectedFromRecommendations: true,
                recoSelection: selection.destination
              }
            });

            await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
            await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: confirmMsg });

            await twilioService.sendSMS(phoneNumber, confirmMsg);

            res.type('text/xml');
            res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
            return { handled: true, destination: selection.destination };
          }

          if (selection.reroll) {
            // User wants different options
            await sessionManager.updateSession(phoneNumber, {
              recoMode: 'rerolling'
            });
            await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
            await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getRerollPrompt() });
            return sendAndReturn(recommendationService.getRerollPrompt());
          }

          if (selection.needsClarification) {
            await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
            await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getClarificationPrompt() });
            return sendAndReturn(recommendationService.getClarificationPrompt());
          }

          // Unclear response - ask for clarification
          await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
          await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getClarificationPrompt() });
          return sendAndReturn(recommendationService.getClarificationPrompt());
        }

        case 'rerolling': {
          // User is providing more details for re-roll
          // Parse their feedback and regenerate
          const vibe = recommendationService.parseVibeResponse(message);
          const prefs = session.recoPreferences || {};

          // Update vibe if they mentioned something new
          const updatedPrefs = { ...prefs };
          if (vibe.category !== 'mixed') {
            updatedPrefs.vibe = vibe;
          }

          console.log(`🎯 Re-generating recommendations with updated preferences:`, updatedPrefs);
          const recoResult = await recommendationService.generateRecommendations(updatedPrefs);
          const formattedRecos = recommendationService.formatRecommendationsForChannel(recoResult.recommendations);

          await sessionManager.updateSession(phoneNumber, {
            recoMode: 'awaiting_selection',
            recoPreferences: updatedPrefs,
            recoRecommendations: recoResult.recommendations
          });

          await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
          await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: formattedRecos });

          await twilioService.sendLongSMS(phoneNumber, formattedRecos);

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
          return { handled: true };
        }
      }
    }

    // Not in reco mode - check if we should enter it
    if (recommendationService.shouldEnterRecoMode(message, session)) {
      console.log(`🎯 Entering recommendation mode for: "${message}"`);

      // Enter recommendation mode
      await sessionManager.updateSession(phoneNumber, {
        recoMode: 'asking_vibe',
        recoPreferences: null,
        recoRecommendations: null
      });

      await sessionManager.addMessage(phoneNumber, { role: 'user', content: message });
      await sessionManager.addMessage(phoneNumber, { role: 'assistant', content: recommendationService.getVibeQuestion() });

      return sendAndReturn(recommendationService.getVibeQuestion());
    }

    // Not in reco mode and shouldn't enter - continue normal flow
    return { handled: false };
  }

  /**
   * Extract preferences from user message and save silently
   * This runs in the background without blocking the main response
   * @param {string} phoneNumber - User's phone number
   * @param {string} message - User's message
   * @param {Object} session - Current session data
   */
  async extractAndSavePreferences(phoneNumber, message, session) {
    try {
      // Build context for extraction
      const context = {
        lastFlightSearch: session.lastFlightSearch,
        lastAccommodationSearch: session.lastAccommodationSearch,
        userPreferences: session.userPreferences
      };

      // Extract structured data from natural language
      const extracted = await conversationExtractor.extractFromMessage(message, context);

      // Get preference updates that should be saved (cabin class, airlines, etc.)
      const preferenceUpdates = conversationExtractor.extractPreferenceUpdates(extracted);

      if (preferenceUpdates) {
        console.log(`💾 Silently saving preferences for ${phoneNumber}:`, preferenceUpdates);

        // Update preferences in database (won't fail if DB not configured)
        try {
          await userPreferencesService.setPreferences(phoneNumber, preferenceUpdates);
        } catch (dbErr) {
          console.warn('Could not save preferences to DB:', dbErr.message);
        }

        // Also update session for immediate use
        await sessionManager.updateSession(phoneNumber, {
          userPreferences: {
            ...(session.userPreferences || {}),
            ...preferenceUpdates
          }
        });
      }

      // If loyalty programs were mentioned, save them too
      if (extracted.loyalty_programs && extracted.loyalty_programs.length > 0) {
        const loyaltyProgramService = require('../services/loyaltyProgramService');

        for (const program of extracted.loyalty_programs) {
          try {
            if (program.type === 'airline') {
              await loyaltyProgramService.addAirlineLoyaltyProgram(phoneNumber, {
                airlineName: program.company,
                programName: program.program_name,
                programNumber: program.member_number || 'pending'
              });
            } else if (program.type === 'hotel') {
              await loyaltyProgramService.addHotelLoyaltyProgram(phoneNumber, {
                hotelChain: program.company,
                programName: program.program_name,
                programNumber: program.member_number || 'pending'
              });
            }
            console.log(`💳 Saved ${program.type} loyalty program: ${program.company}`);
          } catch (loyaltyErr) {
            console.warn('Could not save loyalty program:', loyaltyErr.message);
          }
        }
      }

    } catch (error) {
      // This is non-critical, just log and continue
      console.warn('Preference extraction error (non-blocking):', error.message);
    }
  }

  /**
   * Handle SMS status callbacks from Twilio
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async handleStatusCallback(req, res) {
    const {
      MessageSid: messageSid,
      MessageStatus: status,
      To: to,
      ErrorCode: errorCode,
      ErrorMessage: errorMessage
    } = req.body;

    console.log(`📊 SMS Status: ${messageSid} - ${status}`);

    if (errorCode) {
      console.error(`SMS Error ${errorCode}: ${errorMessage}`);
    }

    // You can log this to a database or analytics service
    // For now, just acknowledge
    res.sendStatus(200);
  }

  /**
   * Detect if user wants accommodation (flexible intent matching)
   * This is NOT rigid keyword matching - it's intent classification
   * @param {string} message - User's message
   * @returns {boolean} True if user wants accommodation
   */
  detectAccommodationIntent(message) {
    const lower = message.toLowerCase().trim();

    // Direct accommodation requests
    const accommodationPatterns = [
      // Exact/near-exact matches
      /^stays?$/i,
      /^hotels?$/i,
      /^airbnb$/i,
      /^accommodations?$/i,
      /^lodging$/i,
      /^place to stay$/i,

      // Affirmative responses to "need a place to stay?"
      /^(yes|yeah|yep|yup|sure|ok|okay|please|definitely|absolutely)$/i,
      /^(yes|yeah|yep|yup|sure|ok|okay)\s*(please|thanks)?$/i,

      // Natural phrasing variations
      /stays?\s*(too|also|as\s*well|please)?/i,
      /hotels?\s*(too|also|as\s*well|please)?/i,
      /airbnb\s*(too|also|as\s*well|please)?/i,
      /(find|get|search|show|book)\s*(me\s*)?(a\s*)?(place|stay|hotel|airbnb|accommodation)/i,
      /(need|want|looking\s*for)\s*(a\s*)?(place|stay|hotel|airbnb|accommodation)/i,
      /place\s*to\s*stay/i,
      /somewhere\s*to\s*stay/i,
      /both\s*(please)?$/i,  // "both" = flight + hotel
      /and\s*(a\s*)?(hotel|stay|accommodation)/i,

      // Implicit affirmatives in context
      /^that\s*too$/i,
      /^add\s*(a\s*)?(hotel|stay)/i,
    ];

    return accommodationPatterns.some(pattern => pattern.test(lower));
  }

  /**
   * Detect if user wants just the flight (no accommodation)
   * @param {string} message - User's message
   * @returns {boolean} True if user explicitly wants only flight
   */
  detectJustFlightIntent(message) {
    const lower = message.toLowerCase().trim();

    const justFlightPatterns = [
      /^just\s*(the\s*)?flight$/i,
      /^(only|just)\s*(the\s*)?flight$/i,
      /^no\s*(hotel|stay|accommodation)/i,
      /^flight\s*only$/i,
      /^(nope|no|nah)$/i,  // Negative response to "need a place to stay?"
      /^i'?m?\s*(good|fine|all\s*set)$/i,  // "im good", "I'm good", "i'm fine"
      /^that'?s?\s*(it|all)$/i,  // "thats it", "that's all", "thats all"
      /^all\s*set$/i,  // "all set"
    ];

    return justFlightPatterns.some(pattern => pattern.test(lower));
  }

  /**
   * Search for accommodations using available services
   * @param {Object} params - Search parameters
   * @param {string} params.destination - Destination city
   * @param {string} params.checkIn - Check-in date (YYYY-MM-DD)
   * @param {string} params.checkOut - Check-out date (YYYY-MM-DD)
   * @param {number} params.guests - Number of guests
   * @returns {Promise<Object>} Accommodation results
   */
  async searchAccommodations({ destination, checkIn, checkOut, guests }) {
    const hotelsService = require('../services/hotelsService');

    let allProperties = [];
    let destinationName = destination;
    let searchType = '';

    // Search Airbnb
    try {
      console.log('🏠 Searching Airbnb...');
      const destinations = await airbnbService.searchDestination(destination, 'USA');
      if (destinations && destinations.length > 0) {
        const airbnbDestId = destinations[0]?.id;
        destinationName = destinations[0]?.name || destination;

        const airbnbParams = {
          destinationId: airbnbDestId,
          checkIn,
          checkOut,
          adults: parseInt(guests) || 1,
          currency: 'USD',
          limit: 10
        };

        const airbnbResults = await airbnbService.searchProperties(airbnbParams);
        const formattedAirbnb = airbnbService.formatPropertyResults(airbnbResults, 5, {
          privateOnly: true,
          minRating: 4.0,
          minReviews: 0
        });

        formattedAirbnb.forEach(prop => prop.source = 'airbnb');
        allProperties = allProperties.concat(formattedAirbnb);
        searchType = 'Airbnb';
        console.log(`✅ Found ${formattedAirbnb.length} Airbnb properties`);
      }
    } catch (airbnbError) {
      console.error('❌ Airbnb search failed:', airbnbError.message);
    }

    // Search Hotels.com
    try {
      console.log('🏨 Searching Hotels.com...');
      const regions = await hotelsService.searchRegion(destination);
      if (regions && regions.length > 0) {
        const hotelLocationId = regions[0]?.id;
        destinationName = regions[0]?.name || destinationName;

        const hotelParams = {
          locationId: hotelLocationId,
          checkIn,
          checkOut,
          adults: parseInt(guests) || 1,
          currency: 'USD',
          limit: 10
        };

        const hotelResults = await hotelsService.searchHotels(hotelParams);
        const formattedHotels = hotelsService.formatHotelResults(hotelResults, 5, {
          minRating: 3.5,
          minReviews: 10
        });

        formattedHotels.forEach(hotel => hotel.source = 'hotel');
        allProperties = allProperties.concat(formattedHotels);
        searchType = searchType ? 'Airbnb & Hotels' : 'Hotels';
        console.log(`✅ Found ${formattedHotels.length} Hotels.com properties`);
      }
    } catch (hotelError) {
      console.error('❌ Hotels.com search failed:', hotelError.message);
    }

    if (allProperties.length === 0) {
      return null;
    }

    // Sort by price and take top 3
    allProperties.sort((a, b) => a.pricePerNight - b.pricePerNight);
    const topProperties = allProperties.slice(0, 3);
    topProperties.forEach((prop, idx) => prop.index = idx + 1);

    return {
      properties: topProperties,
      destinationName,
      searchParams: {
        checkIn,
        checkOut,
        guests: parseInt(guests) || 1
      },
      searchType
    };
  }
}

module.exports = new SMSController();
