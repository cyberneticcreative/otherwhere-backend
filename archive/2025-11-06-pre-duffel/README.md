# Pre-Duffel Services Archive
**Date:** November 6, 2025

## What's Here
This folder contains the original flight and accommodation services that were replaced by Duffel integration.

### Files Archived
1. **googleFlightsService.js** - Google Flights API integration via RapidAPI
   - Airport search and code resolution
   - Flight search (one-way and round-trip)
   - Booking URL generation
   - SMS-formatted results

2. **airbnbService.js** - Airbnb API integration via RapidAPI
   - Destination search
   - Property search with filters
   - Property details
   - Quality filtering and SMS formatting

## Why Archived
- Google Flights API was unreliable
- Airbnb API wasn't working consistently
- Moving to Duffel for flight booking (Links v2 and Flights API)
- Will revisit accommodations with Duffel Stays API when available

## Restoration
If you need to restore these services:
1. Copy the service files back to `src/services/`
2. Update controller imports
3. Restore environment variables (RAPIDAPI_KEY, RAPIDAPI_HOST)

## Migration Date
November 6, 2025 - Migrated to Duffel integration
