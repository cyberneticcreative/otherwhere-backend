# Deployment Checklist for Hotels.com Integration

## 🔧 Configuration Required

### 1. Create `.env` file
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 2. Add RapidAPI Keys
Edit `.env` and add your RapidAPI keys:

```bash
# Airbnb API (via RapidAPI)
RAPIDAPI_KEY_AIRBNB=30b3541a9cmsh8e733c7a9e9154fp1565bejsnd0464b3ea8df

# Hotels.com API (via RapidAPI)
RAPIDAPI_KEY_HOTELS=30b3541a9cmsh8e733c7a9e9154fp1565bejsnd0464b3ea8df

# Fallback RapidAPI key (used if specific keys not set)
RAPIDAPI_KEY=30b3541a9cmsh8e733c7a9e9154fp1565bejsnd0464b3ea8df
```

**Note:** You can use the same RapidAPI key for all three if you have access to both APIs under one subscription.

### 3. Verify RapidAPI Subscriptions
Make sure you're subscribed to both APIs in your RapidAPI dashboard:
- **Airbnb API**: https://rapidapi.com/DataCrawler/api/airbnb19
- **Hotels.com API**: https://rapidapi.com/ntd119/api/hotels-com6

To subscribe:
1. Go to each API page
2. Click "Subscribe to Test"
3. Choose a pricing plan (free tier available)
4. Confirm subscription

### 4. Update OpenAI Assistant Function Schema
Go to https://platform.openai.com/assistants and update the `search_accommodations` function:

Add this parameter to the function schema:
```json
"accommodation_type": {
  "type": "string",
  "enum": ["airbnb", "hotel", "both"],
  "description": "Type of accommodation to search: 'airbnb' for Airbnb properties, 'hotel' for Hotels.com hotels, or 'both' to search both platforms (default: 'both')"
}
```

See `OPENAI_FUNCTION_SCHEMA.md` for the complete function schema.

### 5. Restart the Backend
After updating `.env`, restart your server:
```bash
# If using npm
npm restart

# Or if using a process manager
pm2 restart otherwhere-backend

# Or just stop and start
npm start
```

## 🧪 Testing

After configuration, test with these messages:

### Test 1: Hotel Only
```
Find me a hotel in Montreal for April 1-12, 2 adults
```

**Expected logs:**
```
🏠 Accommodation type preference: "hotel"
🔍 Search decisions: Airbnb=false, Hotels=true
🏨 Calling Hotels.com API...
```

### Test 2: Airbnb Only
```
Find me an Airbnb in Montreal for April 1-12, 2 adults
```

**Expected logs:**
```
🏠 Accommodation type preference: "airbnb"
🔍 Search decisions: Airbnb=true, Hotels=false
🏠 Calling Airbnb API...
```

### Test 3: Both (Default)
```
Find me a place to stay in Montreal for April 1-12, 2 adults
```

**Expected logs:**
```
🏠 Accommodation type preference: "both"
🔍 Search decisions: Airbnb=true, Hotels=true
🏠 Calling Airbnb API...
🏨 Calling Hotels.com API...
```

## 📋 Troubleshooting

### Issue: "Access denied" from Hotels.com API
**Solution:** Check that you're subscribed to the Hotels.com API in RapidAPI dashboard.

### Issue: Still calling Airbnb when requesting hotels
**Cause:** OpenAI Assistant function schema not updated.
**Solution:** Update the function schema in OpenAI dashboard to include `accommodation_type` parameter.

### Issue: Rate limit (429 error) from Airbnb
**Cause:** Too many requests in short time.
**Solution:**
- Wait 2-3 minutes between tests
- The code has built-in rate limiting (2.5s between requests)
- If Hotels.com works, it will show results even if Airbnb fails

### Issue: No results from either API
**Cause:** API keys not loaded.
**Solution:**
1. Verify `.env` file exists and has keys
2. Restart the backend
3. Check logs for "API not configured" errors

## 🔍 Debug Logs

With the latest changes, you'll see detailed logs:

```
🏠 Accommodation type preference: "hotel" (type: string)
🔍 Search decisions: Airbnb=false, Hotels=true
```

This will help diagnose routing issues. If you see:
- `Airbnb=true` when you requested "hotel" → OpenAI function schema issue
- `Hotels=true` but no Hotels.com logs → API key not configured
- Both `=false` → accommodationType not being set correctly

## ✅ Success Indicators

You'll know it's working when:
1. Requesting "hotel" shows `🏨 Calling Hotels.com API...` only
2. Requesting "airbnb" shows `🏠 Calling Airbnb API...` only
3. No specification shows both emojis in results: `🏠` and `🏨`
4. SMS shows mixed results with source icons

Example SMS with both:
```
🏠 Montreal, QC 04/01-04/12

1. 🏠 Cozy Downtown Loft - $425/nt
Entire apartment ⭐4.8

2. 🏨 Marriott Downtown - $450/nt
4★ Hotel ⭐4.7

3. 🏠 Modern Studio - $475/nt
Entire studio ⭐New

Reply 1-3 for booking link
```
