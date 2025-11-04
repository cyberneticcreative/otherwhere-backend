# OpenAI Assistant Configuration Guide

## Problem Fixed
This update fixes 4-minute SMS response delays caused by blocking flight searches during conversation.

## Changes Made to Backend Code

### 1. Added Field Validation
- `search_trips` function now validates ALL required fields are present
- If fields are missing, returns error to Assistant asking it to collect missing info
- Prevents premature searches with incomplete data

### 2. Async Flight Search
- Flight searches now run in background (non-blocking)
- User gets immediate conversational response (~5-10 seconds)
- Flight results arrive as separate SMS once search completes
- No more 4-minute delays!

### 3. Phone Number Context
- SMS controller now passes user's phone number to assistant service
- Enables async notification when search completes

---

## OpenAI Assistant Configuration Required

You need to update your OpenAI Assistant in the OpenAI dashboard to match these code changes.

### Assistant ID
Current: `process.env.OPENAI_ASSISTANT_ID`

### Tool Configuration: `search_trips`

Update the `search_trips` function/tool definition to mark all fields as **required**:

```json
{
  "name": "search_trips",
  "description": "Search for flights and travel options once ALL trip details have been collected from the user. Only call this function when you have destination, origin, check-in date, check-out date, and number of travelers.",
  "parameters": {
    "type": "object",
    "properties": {
      "destination": {
        "type": "string",
        "description": "Destination city or location (e.g., 'Paris', 'Tokyo', 'New York')"
      },
      "origin": {
        "type": "string",
        "description": "Origin city or airport code (e.g., 'LAX', 'JFK', 'Los Angeles')"
      },
      "check_in": {
        "type": "string",
        "description": "Check-in or departure date in YYYY-MM-DD format (e.g., '2024-06-15')"
      },
      "check_out": {
        "type": "string",
        "description": "Check-out or return date in YYYY-MM-DD format (e.g., '2024-06-22')"
      },
      "travelers": {
        "type": "integer",
        "description": "Number of travelers (minimum 1)"
      },
      "budget_usd": {
        "type": "number",
        "description": "Maximum budget in USD (optional)"
      }
    },
    "required": [
      "destination",
      "origin",
      "check_in",
      "check_out",
      "travelers"
    ]
  }
}
```

**Key Changes:**
- ✅ All fields except `budget_usd` are now **required**
- ✅ Updated description emphasizes "once ALL trip details have been collected"
- ✅ Changed `budget_cad` to `budget_usd` to match USD currency usage

---

## Updated Assistant Instructions

Update your Assistant's system instructions to emphasize gathering ALL info before searching:

```markdown
You are Otherwhere, an AI travel concierge assistant. Your role is to help travelers plan amazing trips through natural conversation via SMS.

## Your Process:

### 1. Gather Information (REQUIRED BEFORE SEARCH)
Ask conversational questions to collect ALL of these details:
- ✅ **Destination** - Where do they want to go?
- ✅ **Origin** - Where are they traveling from?
- ✅ **Check-in Date** - When do they want to depart? (YYYY-MM-DD)
- ✅ **Check-out Date** - When do they want to return? (YYYY-MM-DD)
- ✅ **Number of Travelers** - How many people are traveling?
- 💰 **Budget** (optional) - What's their budget range in USD?

**IMPORTANT:** Do NOT call the `search_trips` function until you have collected ALL required information above. Ask one or two questions at a time to keep the conversation natural.

### 2. Search for Trips
Once you have ALL the required information:
- Call the `search_trips` function with the collected details
- Let the user know you're searching for options
- The search will happen in the background and results will be texted to them

### 3. Conversational Style
- Be friendly, enthusiastic, and helpful
- Keep responses concise (under 160 characters when possible for SMS)
- Ask clarifying questions if anything is unclear
- Don't make assumptions - always ask if you're not sure
- Use natural language, avoid overly formal or robotic responses

### 4. Handling Dates
- Accept dates in various formats (e.g., "June 15", "next Friday", "6/15/2024")
- Convert them to YYYY-MM-DD format for the search function
- Confirm dates with the user to avoid mistakes

### 5. Response After Search
When you call `search_trips`, inform the user:
- "Perfect! I'm searching for flights to [destination] from [check-in] to [check-out]. I'll text you the best options in just a moment!"
- Keep it friendly and set expectations that results will arrive shortly

## Examples:

**Good Conversation Flow:**
```
User: I want to plan a trip
You: Great! Where would you like to go?
User: Paris
You: Paris sounds amazing! When are you thinking of traveling?
User: June 15 to June 22
You: Perfect! How many people will be traveling?
User: 2 people
You: And where will you be flying from?
User: Los Angeles
You: Excellent! I'm searching for flights to Paris from LA for 2 travelers, June 15-22. I'll text you the best options in a moment!
[Calls search_trips function]
```

**Bad Conversation Flow (DON'T DO THIS):**
```
User: I want to go to Paris
You: Great! Let me search for trips to Paris
[Calls search_trips without dates, origin, or travelers - THIS WILL FAIL]
```

Remember: Quality conversations lead to better trip planning. Take your time to collect all the details!
```

---

## How to Update Your Assistant

### Option 1: Via OpenAI Dashboard (Recommended)
1. Go to https://platform.openai.com/assistants
2. Find your assistant (ID: `process.env.OPENAI_ASSISTANT_ID`)
3. Click "Edit"
4. Update **Instructions** section with the content above
5. Go to **Tools** section
6. Edit the `search_trips` function
7. Update the JSON schema with the one above
8. Save changes

### Option 2: Via OpenAI API
```javascript
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

await openai.beta.assistants.update(
  process.env.OPENAI_ASSISTANT_ID,
  {
    instructions: `[Paste the instructions from above]`,
    tools: [
      {
        type: "function",
        function: {
          // Paste the search_trips JSON from above
        }
      }
    ]
  }
);
```

---

## Testing Your Changes

### Test Conversation Flow

**Test 1: Incomplete Information (Should NOT search)**
```
User: "I want to go to Paris"
Expected: Assistant asks for dates, origin, and travelers
Expected: NO flight search triggered yet
```

**Test 2: Complete Information (Should search async)**
```
User: "I want to go to Paris from LA, June 15-22, 2 people"
Expected: Assistant confirms and starts search
Expected: Response arrives in ~5-10 seconds
Expected: Flight results arrive as separate SMS shortly after
```

**Test 3: Partial Information**
```
User: "Paris in June"
Expected: Assistant asks for specific dates, origin, number of travelers
Expected: NO flight search triggered yet
```

### Monitor Logs

Look for these log patterns after deploying:

✅ **Good Flow (Fast Response):**
```
🔧 Handling 1 function call(s)
🔍 search_trips called with: {...}
🛫 Triggering async flight search...
⚡ Search started in background, responding immediately
✅ Submitted 1 tool output(s)
✅ Assistant response received
[User gets SMS in ~5-10 seconds]
✅ Background search completed: 5 flights found
✅ Flight results SMS sent
```

⚠️ **Missing Fields (Validation Working):**
```
🔧 Handling 1 function call(s)
🔍 search_trips called with: {destination: "Paris"}
⚠️ Missing required fields: origin, check_in, check_out, travelers
✅ Submitted 1 tool output(s)
[Assistant asks for missing information]
```

---

## Rollback Plan

If issues occur, you can rollback by:

1. **Revert code changes:**
```bash
git revert HEAD
git push
```

2. **Revert Assistant configuration:**
   - Make `search_trips` fields optional again
   - Remove the strict gathering instructions

---

## Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| SMS Response Time | ~4 minutes | ~5-10 seconds |
| User Experience | Frustrating delays | Immediate responses |
| Flight Results Delivery | Inline (delayed) | Separate SMS (async) |
| Premature Searches | Frequent | Prevented by validation |

---

## Support

If you encounter issues:
1. Check logs for validation warnings
2. Verify OpenAI Assistant tool configuration matches this doc
3. Test with complete vs incomplete trip details
4. Monitor Twilio message logs

Last Updated: 2025-11-04
