# ⚠️ THIS DOCUMENT IS OUTDATED

**This architecture change was NOT implemented.**

The backend was planned to be deprecated in favor of Twilio Functions + n8n, but that migration never happened. The Express backend is still actively maintained and in production use.

**See `ARCHITECTURE.md` for the current, accurate architecture documentation.**

---

## What Actually Happened

The backend continues to be the primary service for Otherwhere. Recent updates include:
- Removed n8n integration (not needed)
- Using TravelPayouts and Google Flights APIs directly
- ElevenLabs integration for voice
- OpenAI Assistants API for SMS
- Webhook signature validation for security

**Do not refer to this document for current architecture information.**

---

# Original Document (OUTDATED - DO NOT USE)

# ⚠️ BACKEND DEPRECATED (THIS DID NOT HAPPEN)

**Date:** October 30, 2025
**Reason:** Simplified architecture - backend middleware no longer needed (THIS CHANGE WAS NOT MADE)

## Previous Architecture (Deprecated)

```
User → Twilio → Backend (Node.js/Express) → OpenAI/ElevenLabs → n8n → APIs
```

Problems:
- Unnecessary middleware layer
- Mixed OpenAI + ElevenLabs confusion
- ngrok required for local testing
- Over-complicated for simple workflows

## New Architecture (Current)

```
SMS:   User → Twilio Function (state machine) → n8n → APIs → Twilio SMS
Voice: User → ElevenLabs Agent → n8n → APIs → Twilio SMS
```

Benefits:
- ✅ No backend server needed
- ✅ No OpenAI dependency
- ✅ Direct integrations
- ✅ Simpler to maintain
- ✅ Lower infrastructure cost

## Components

### 1. Twilio Functions
- **File:** `/functions/inbound-sms.js`
- **Purpose:** SMS menu + conversation state machine
- **Handles:** "travel" keyword → menu → 4 questions → webhook to n8n

### 2. ElevenLabs Conversational AI
- **Agent ID:** `agent_3301k8rhn9jxe4wbn3wfzaqrw1f5`
- **Purpose:** Natural voice conversations
- **Webhook:** `https://cyberneticcreative.app.n8n.cloud/webhook-test/409b90f4-a815-405c-a5b8-bb533d51d5b4`

### 3. n8n Workflow
- **Receives:** Trip data from ElevenLabs or Twilio Function
- **Processes:**
  - Call Travelpayouts API (flights)
  - Call Booking.com API (hotels)
  - Call GetYourGuide API (experiences)
- **Sends:** Results via Twilio SMS

## Configuration

### Twilio Phone Number: +12568185323
- **SMS Webhook:** Twilio Function (inbound-sms.js)
- **Voice Webhook:** ElevenLabs (configured in ElevenLabs dashboard)

### Environment Variables (n8n)
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+12568185323
TRAVELPAYOUTS_TOKEN=your_token
RAPIDAPI_KEY=your_key (for Booking.com)
GETYOURGUIDE_API_KEY=your_key
```

## Migration Checklist

- [x] Twilio Functions deployed with SMS flow
- [x] ElevenLabs agent configured with webhook
- [ ] n8n workflow receives webhooks from both sources
- [ ] n8n integrates real travel APIs (not mock data)
- [ ] n8n sends SMS via Twilio node
- [ ] Backend repository archived/deleted

## What Was Deleted

This repository contained:
- Express.js server
- OpenAI integration (llmService)
- Session management (Redis)
- Twilio middleware
- SMS/Voice controllers
- Webhook handlers

All replaced by: **Twilio Functions + ElevenLabs + n8n**

## Next Steps

Focus on n8n workflow:
1. Connect Travelpayouts API for flights
2. Connect Booking.com API for hotels
3. Connect GetYourGuide API for experiences
4. Implement date parsing for natural language
5. Format results into SMS-friendly format

---

**This backend is deprecated and should not be used.**
**See Twilio Functions and n8n workflow for current implementation.**
