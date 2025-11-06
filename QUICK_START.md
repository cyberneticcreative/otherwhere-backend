# Duffel Integration - Quick Start Guide

## 🚀 What You Need to Do Now

### 1. Set Up Railway PostgreSQL (5 minutes)

In your Railway project dashboard:
```
1. Click "+ New"
2. Select "Database" → "PostgreSQL"
3. Railway automatically creates DATABASE_URL
4. Done! ✅
```

The app will auto-run migrations on first connection.

### 2. Add Environment Variables to Railway (2 minutes)

Go to your Railway app → Variables tab and add:

```env
DUFFEL_ACCESS_TOKEN=duffel_test_YOUR_TOKEN_HERE
DUFFEL_WEBHOOK_SECRET=(you'll get this in step 3)
```

Optional branding (has defaults):
```env
BRAND_NAME=Otherwhere
BRAND_LOGO_URL=https://otherwhere.app/logo.png
BRAND_COLOR=#E75C1E
SUCCESS_URL=https://otherwhere.app/success
CANCEL_URL=https://otherwhere.app/cancel
FAILURE_URL=https://otherwhere.app/failure
```

### 3. Configure Duffel Webhooks (3 minutes)

1. Go to https://duffel.com/dashboard
2. Settings → Webhooks → "Add webhook"
3. URL: `https://your-app.railway.app/webhooks/duffel`
4. Events to subscribe:
   - ✅ `order.created`
   - ✅ `order.updated`
   - ✅ `order.cancelled`
   - ✅ `session.completed`
5. Copy the webhook secret
6. Add to Railway: `DUFFEL_WEBHOOK_SECRET=whsec_xxx`

### 4. Deploy (1 minute)

```bash
git add .
git commit -m "Add Duffel integration"
git push
```

Railway auto-deploys. Watch for:
```
✅ Database connected
✅ Duffel API: test mode
```

### 5. Test (2 minutes)

Send SMS to your Twilio number:
```
Find flights from Vancouver to Tokyo December 15-22
```

You should receive:
```
✈️ Found flight options for you!

Route: YVR → NRT
Departure: 2025-12-15
Return: 2025-12-22

Book securely here:
https://links.duffel.com/sessions/ses_xxx

Includes fare monitoring + rebooking support.
```

Click the link → Browse flights → Complete test booking (Duffel test mode)

You'll receive a confirmation SMS with booking reference!

---

## 📊 What Changed

**Before:** Google Flights API → 3 options → user selects → Google booking URL

**After:** Duffel Links → user clicks → professional checkout → real booking

**Revenue:** 2% per booking (min $10) automatically included

---

## 🔍 Check It's Working

### Database Check
```sql
-- Run in Railway PostgreSQL plugin
SELECT * FROM bookings ORDER BY created_at DESC LIMIT 5;
```

### API Health Check
```bash
curl https://your-app.railway.app/health
```

### Recent Events
```sql
SELECT event_type, created_at, payload->>'message'
FROM event_logs
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🆘 Common Issues

**"Database connection failed"**
→ Check DATABASE_URL is set in Railway

**"Duffel API not configured"**
→ Check DUFFEL_ACCESS_TOKEN is set

**"No webhook received"**
→ Check webhook URL in Duffel dashboard
→ Check DUFFEL_WEBHOOK_SECRET matches

**"SMS not sent after booking"**
→ Check conversation has valid phone number
→ Check Twilio logs

---

## 📖 Full Documentation

See `DUFFEL_MIGRATION.md` for complete details, testing guide, and troubleshooting.

---

## ✨ What's Next (Phase 2)

Once Phase 1 is stable:
- 👤 User accounts + saved cards (Stripe)
- 🎯 Concierge "book for me" mode (8% fee vs 2%)
- 🏨 Duffel Stays (when access granted)
- 📊 Analytics dashboard
- 💰 Fare monitoring & alerts

---

**Ready to go!** 🚀

Just complete steps 1-4 above and you'll be taking real flight bookings with Duffel.
