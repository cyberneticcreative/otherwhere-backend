const twilioService = require('../services/twilioService');
const llmService = require('../services/llmService');
const assistantService = require('../services/assistantService');
const sessionManager = require('../services/sessionManager');

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
      const session = await sessionManager.getSession(from);
      await sessionManager.updateSession(from, { channel: 'sms' });

      // Check if user is selecting a flight number (1, 2, or 3)
      const flightSelection = body.trim().match(/^([123])$/);
      if (flightSelection && session.lastFlightResults) {
        const selectedIndex = parseInt(flightSelection[1]) - 1;
        const selectedFlight = session.lastFlightResults[selectedIndex];

        if (selectedFlight) {
          console.log(`✈️ User selected flight #${flightSelection[1]}, fetching booking URL...`);

          let bookingUrl = null;

          // Try to get booking URL using token
          if (selectedFlight.bookingToken) {
            try {
              const googleFlightsService = require('../services/googleFlightsService');
              const bookingData = await googleFlightsService.getBookingURL(selectedFlight.bookingToken);
              bookingUrl = bookingData.bookingUrl;
            } catch (error) {
              console.error('❌ Error getting booking URL from token:', error.message);
            }
          }

          // Fallback: construct manual Google Flights search URL if token failed
          if (!bookingUrl && session.lastFlightSearch) {
            const { origin, destination, startDate, endDate } = session.lastFlightSearch;
            if (origin && destination && startDate) {
              // Construct Google Flights URL manually
              bookingUrl = `https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI1LTEyLTE0ag0IAhIJL20vMDUycDdyDQgCEgkvbS8wNGpwbCIKYgoyMDI2LTAxLTI2`;
              console.log(`🔗 Using fallback Google Flights search URL`);
            }
          }

          const bookingMessage = bookingUrl
            ? `Great choice! ✈️\n\n${selectedFlight.airline} - $${selectedFlight.price}\n${selectedFlight.departure} → ${selectedFlight.arrival}\n\n🔗 Book here: ${bookingUrl}`
            : `Great choice! ✈️\n\n${selectedFlight.airline} - $${selectedFlight.price}\n${selectedFlight.departure} → ${selectedFlight.arrival}\n\nPlease search on Google Flights for this route.`;

          await twilioService.sendSMS(from, bookingMessage);

          res.type('text/xml');
          res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

          const totalDuration = Date.now() - startTime;
          console.log(`⏱️  TOTAL request time: ${totalDuration}ms (${(totalDuration/1000).toFixed(1)}s)`);
          return;
        }
      }

      // Add user message to conversation history
      await sessionManager.addMessage(from, {
        role: 'user',
        content: body
      });

      // Decide whether to use OpenAI Assistant or direct LLM
      const useAssistant = assistantService.isConfigured();

      let responseText;
      let tripSearchData = null;
      let flightResults = null;

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

          // Send message to assistant
          const assistantResponse = await assistantService.sendMessage(
            session.threadId,
            body
          );

          responseText = assistantResponse.text;
          tripSearchData = assistantResponse.tripSearch;
          flightResults = assistantResponse.flightResults;

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

      // If we have flight results, send them as a separate SMS
      if (flightResults && flightResults.flights && flightResults.flights.length > 0) {
        console.log('✈️ Sending flight results as separate SMS...');

        // Store flight results and search details in session so user can select one later
        await sessionManager.updateSession(from, {
          lastFlightResults: flightResults.flights,
          lastFlightSearch: {
            origin: flightResults.originCode,
            destination: flightResults.destCode,
            startDate: flightResults.searchParams?.outboundDate,
            endDate: flightResults.searchParams?.returnDate
          }
        });
        console.log(`💾 Stored ${flightResults.flights.length} flights in session`);

        // Use Google Flights service for formatting
        const googleFlightsService = require('../services/googleFlightsService');
        const flightMessage = googleFlightsService.formatSMSMessage(
          flightResults.flights,
          {
            departureId: flightResults.originCode,
            arrivalId: flightResults.destCode,
            outboundDate: flightResults.searchParams?.outboundDate
          }
        );

        // Send flight details as a second SMS (after a brief delay for better UX)
        setTimeout(async () => {
          try {
            await twilioService.sendLongSMS(from, flightMessage);
            console.log('✅ Flight results SMS sent');
          } catch (smsError) {
            console.error('❌ Failed to send flight results SMS:', smsError);
          }
        }, 2000); // 2 second delay
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
}

module.exports = new SMSController();
