# OpenAI Assistant Setup Guide

## Function Definition: search_trips

To enable cabin class selection (economy, business, first), update your OpenAI Assistant function definition in the OpenAI dashboard:

### Function Name
`search_trips`

### Description
Search for flights and accommodations for a trip

### Parameters (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "destination": {
      "type": "string",
      "description": "Destination city or airport code (e.g., 'London', 'NYC', 'JFK')"
    },
    "origin": {
      "type": "string",
      "description": "Origin city or airport code (e.g., 'Toronto', 'LAX', 'YYZ')",
      "default": "LAX"
    },
    "check_in": {
      "type": "string",
      "description": "Check-in or departure date in YYYY-MM-DD format"
    },
    "check_out": {
      "type": "string",
      "description": "Check-out or return date in YYYY-MM-DD format"
    },
    "travelers": {
      "type": "integer",
      "description": "Number of travelers/passengers",
      "default": 1
    },
    "cabin_class": {
      "type": "string",
      "description": "Flight cabin class preference",
      "enum": ["economy", "premium_economy", "business", "first"],
      "default": "economy"
    },
    "budget_usd": {
      "type": "number",
      "description": "Optional total budget in USD"
    }
  },
  "required": ["destination", "check_in"]
}
```

### Instructions for the Assistant

Add this to your assistant's system prompt:

```
When users request specific cabin classes (business, first class, premium economy),
include the cabin_class parameter in your search_trips function call:
- "business class" → cabin_class: "business"
- "first class" → cabin_class: "first"
- "premium economy" → cabin_class: "premium_economy"
- Default to "economy" if not specified

Examples:
- "Find business class flights to London" → cabin_class: "business"
- "I want first class to Tokyo" → cabin_class: "first"
- "Show me premium economy options" → cabin_class: "premium_economy"
```

## How to Update

1. Go to https://platform.openai.com/assistants
2. Select your assistant
3. Scroll to "Functions"
4. Edit the `search_trips` function
5. Update the parameters JSON schema to include `cabin_class`
6. Save changes

## Testing

Test with these SMS messages:
- "Find business class flights from Toronto to NYC March 2-18"
- "Show me first class options to London"
- "I want premium economy to Paris"

The system will now search for the requested cabin class and include it in the booking URLs.
