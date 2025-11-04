# ElevenLabs Webhook Configuration

## Important Configuration for Tool Call Webhooks

When configuring your ElevenLabs voice agent, you need to ensure the phone number is passed through to the tool call webhook.

### Webhook URL Configuration

In your ElevenLabs agent settings:

1. **Tool Call Webhook URL**: `https://your-domain.com/webhook/elevenlabs/tool-call`

2. **Pass Phone Number as Query Parameter** (Recommended):
   ```
   https://your-domain.com/webhook/elevenlabs/tool-call?from={{phone_number}}
   ```

### Alternative: Configure Agent to Include Metadata

If ElevenLabs supports passing custom metadata in tool calls, configure the agent to include:

```json
{
  "metadata": {
    "phone_number": "{{caller_phone}}",
    "from": "{{caller_phone}}"
  }
}
```

### Fallback Behavior

The backend now includes a fallback mechanism that:

1. Checks webhook metadata for phone number
2. If not found, searches for active voice sessions (last 5 minutes)
3. If still not found, returns verbal flight results without SMS

### Testing

To verify the configuration is working:

1. Make a voice call to your Twilio number
2. Request a flight search
3. Check backend logs for: `📱 Phone number found: +1234567890`

If you see: `⚠️ No phone number in webhook metadata`, the phone number is not being passed correctly.

### Required ElevenLabs Agent Configuration

Your ElevenLabs agent should have:

- **Agent ID**: Set in `ELEVENLABS_VOICE_AGENT_ID` env var
- **Tool/Function**: `search_trips` configured with parameters:
  - `destination` (string)
  - `origin` (string, default: "LAX")
  - `check_in` (string, date format: YYYY-MM-DD)
  - `check_out` (string, date format: YYYY-MM-DD)
  - `travelers` (number, default: 1)
  - `budget` or `budget_usd` (number, optional)

- **Tool Webhook**: Point to your backend's tool-call endpoint
- **Post-call Webhook**: `https://your-domain.com/webhook/elevenlabs`
