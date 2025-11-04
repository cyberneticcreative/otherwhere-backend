# ElevenLabs Webhook Configuration

## Webhook URL

Set this in your ElevenLabs agent configuration:

**Tool Call Webhook URL**: `https://otherwhere-backend-production.up.railway.app/webhook/elevenlabs/tool-call`

## How Phone Numbers Work

The agent should **ask the user for their phone number** during the conversation, then pass it as a parameter to the `search_trips` function.

### Example Agent Flow

1. Agent: "I'd be happy to search for flights to Tokyo! What phone number should I text the results to?"
2. User: "647-293-7581" or "six four seven two nine three seven five eight one"
3. Agent: Calls `search_trips` with `phone_number` parameter
4. Backend receives the phone number, searches flights, and sends SMS

### Phone Number Priority (Backend Logic)

The backend will look for the phone number in this order:

1. **`phone_number` parameter** (from agent asking user) ⭐ **RECOMMENDED**
2. `metadata.phone_number` or `metadata.from` (if passed by webhook)
3. Active voice session lookup (fallback within last 5 minutes)
4. If none found: Returns verbal results only (no SMS)

### Phone Number Formats Supported

The backend automatically normalizes phone numbers to E.164 format:

- `6472937581` → `+16472937581`
- `647-293-7581` → `+16472937581`
- `1-647-293-7581` → `+16472937581`
- `+16472937581` → `+16472937581` (already correct)

So the agent can accept phone numbers in any common format!

### Testing

To verify the configuration is working:

1. Make a voice call to your Twilio number
2. Request a flight search
3. Check backend logs for: `📱 Phone number found: +1234567890`

If you see: `⚠️ No phone number in webhook metadata`, the phone number is not being passed correctly.

### Required ElevenLabs Agent Configuration

Your ElevenLabs agent should have:

- **Agent ID**: Set in `ELEVENLABS_VOICE_AGENT_ID` env var
- **Tool/Function Name**: `search_trips`
- **Tool Parameters**:
  - `destination` (string, required) - e.g., "Tokyo", "Paris", "London"
  - `origin` (string, optional, default: "LAX") - e.g., "Toronto", "Vancouver", "New York"
  - `check_in` (string, required) - Departure date in YYYY-MM-DD format, e.g., "2025-12-02"
  - `check_out` (string, required) - Return date in YYYY-MM-DD format, e.g., "2026-01-02"
  - `travelers` (string or number, optional, default: "1")
  - `budget` or `budget_usd` (string or number, optional) - Budget amount in USD
  - **`phone_number` (string, recommended)** - User's phone number for SMS results

- **Tool Webhook**: `https://otherwhere-backend-production.up.railway.app/webhook/elevenlabs/tool-call`
- **Post-call Webhook**: `https://otherwhere-backend-production.up.railway.app/webhook/elevenlabs`

### Agent Prompt Suggestion

Configure your agent to collect all information before calling the function:

```
When a user wants to search for flights:
1. Ask for destination
2. Ask for origin (if not mentioned, assume they mean from their location)
3. Ask for travel dates (departure and return)
4. Ask for number of travelers
5. Ask "What phone number should I text the flight options to?"
6. Once you have all information, call the search_trips function
```

### Important: Date Format

Make sure the agent converts user-friendly dates to YYYY-MM-DD format:
- User says: "December 2nd" → Agent passes: "2025-12-02"
- User says: "January 2nd" → Agent passes: "2026-01-02"

Check the current year and use appropriate logic for date conversion.
