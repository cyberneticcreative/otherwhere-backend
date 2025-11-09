# OpenAI Assistant Function Schemas

These function schemas need to be configured in the OpenAI Assistant dashboard.

## search_accommodations Function Schema

```json
{
  "name": "search_accommodations",
  "description": "Search for accommodations (Airbnb and/or Hotels) in a destination city with specified dates and guest count. Can search Airbnb only, Hotels only, or both (default).",
  "parameters": {
    "type": "object",
    "properties": {
      "destination": {
        "type": "string",
        "description": "The destination city name (e.g., 'Paris', 'New York', 'Tokyo')"
      },
      "check_in": {
        "type": "string",
        "description": "Check-in date in YYYY-MM-DD format (e.g., '2025-06-15')"
      },
      "check_out": {
        "type": "string",
        "description": "Check-out date in YYYY-MM-DD format (e.g., '2025-06-22')"
      },
      "guests": {
        "type": "integer",
        "description": "Number of guests/adults staying"
      },
      "budget_per_night_usd": {
        "type": "number",
        "description": "Maximum budget per night in USD (optional). If user gives total budget, calculate: total_budget / number_of_nights"
      },
      "accommodation_type": {
        "type": "string",
        "enum": ["airbnb", "hotel", "both"],
        "description": "Type of accommodation to search: 'airbnb' for Airbnb properties, 'hotel' for Hotels.com hotels, or 'both' to search both platforms (default: 'both')"
      }
    },
    "required": ["destination", "check_in", "check_out", "guests"]
  }
}
```

## search_trips Function Schema (for reference)

```json
{
  "name": "search_trips",
  "description": "Search for round-trip or one-way flights between two cities with specified dates and traveler count",
  "parameters": {
    "type": "object",
    "properties": {
      "destination": {
        "type": "string",
        "description": "Destination city or IATA airport code (e.g., 'Paris', 'New York', 'JFK')"
      },
      "origin": {
        "type": "string",
        "description": "Origin city or IATA airport code. If not provided, system will infer from user's phone area code"
      },
      "check_in": {
        "type": "string",
        "description": "Departure date in YYYY-MM-DD format (e.g., '2025-06-15')"
      },
      "check_out": {
        "type": "string",
        "description": "Return date in YYYY-MM-DD format (e.g., '2025-06-22'). Omit for one-way flights"
      },
      "travelers": {
        "type": "integer",
        "description": "Number of travelers/passengers"
      },
      "budget_usd": {
        "type": "number",
        "description": "Maximum total budget in USD for the flight (optional)"
      }
    },
    "required": ["destination", "check_in", "travelers"]
  }
}
```

## How to Update the OpenAI Assistant

1. Go to https://platform.openai.com/assistants
2. Select your Otherwhere assistant
3. Click "Edit" or "Configure"
4. Go to the "Functions" section
5. Find the `search_accommodations` function
6. Update it with the schema above (especially add the `accommodation_type` parameter)
7. Save the changes

## Testing After Update

After updating the function schema, test with:
- "Find me a hotel in Montreal for April 1-12" (should set accommodation_type="hotel")
- "Find me an Airbnb in Montreal for April 1-12" (should set accommodation_type="airbnb")
- "Find me a place to stay in Montreal for April 1-12" (should default to accommodation_type="both")
