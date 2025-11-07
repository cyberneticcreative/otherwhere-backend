# Duffel Links Activation Checklist

**Use this when Duffel grants Links access** 🎉

---

## ⚡ Quick Start (30 minutes)

### Step 1: Get Credentials (5 min)
- [ ] Log into Duffel dashboard
- [ ] Verify "Links" is enabled in your account
- [ ] Copy production API token: `duffel_live_xxxxx`
- [ ] Go to Settings → Webhooks
- [ ] Create webhook: `https://your-app.railway.app/webhooks/duffel`
- [ ] Subscribe to: `order.created`, `order.updated`, `order.cancelled`
- [ ] Copy webhook secret

### Step 2: Set Environment Variables (2 min)

In Railway dashboard:

```env
DUFFEL_ACCESS_TOKEN=duffel_live_YOUR_TOKEN_HERE
DUFFEL_WEBHOOK_SECRET=your_webhook_secret_here
SUCCESS_URL=https://otherwhere.app/booking-success
FAILURE_URL=https://otherwhere.app/booking-failed
ABANDONMENT_URL=https://otherwhere.app/booking-cancelled
```

### Step 3: Update Code (15 min)

**File 1:** `src/services/duffelLinksService.js`

Replace `createFlightSession()` function (lines 49-120) with the code from `DUFFEL_LINKS_IMPLEMENTATION.md` Step 2.

**File 2:** `src/services/duffelLinksService.js`

Update `formatLinksSMS()` function (lines 145-179) with the code from `DUFFEL_LINKS_IMPLEMENTATION.md` Step 3.

**File 3:** `src/services/assistantService.js`

Add Kayak fallback logic in `search_trips` function - see `DUFFEL_LINKS_IMPLEMENTATION.md` Step 4.

### Step 4: Deploy (3 min)

```bash
git add .
git commit -m "Enable Duffel Links with 3% + $20 min markup"
git push origin master
```

Wait for Railway to deploy (~2 minutes).

### Step 5: Test (5 min)

**Send SMS to yourself:**
```
Find flights from Vancouver to Tokyo December 15-22
```

**Expected:**
```
✈️ YVR → NRT
Departing: 12/15
Returning: 12/22

📲 Browse flights & book:
https://links.duffel.com/sessions/ses_xxxxx

✓ Compare all airlines
✓ Secure checkout
✓ Instant confirmation
✓ Best prices guaranteed

Link expires in 24 hours
```

**Click the link** - should see Duffel checkout page!

---

## ✅ Verification Checklist

After deployment:

- [ ] SMS received with Duffel Links URL (not Kayak)
- [ ] URL starts with `https://links.duffel.com/sessions/`
- [ ] Clicking link opens Duffel branded page
- [ ] Origin/destination pre-filled correctly
- [ ] Dates pre-filled correctly
- [ ] Otherwhere logo visible (if uploaded)
- [ ] Can browse flights on Duffel page
- [ ] Prices include markup (check against airline website)

**Test a booking:**
- [ ] Select a flight
- [ ] Complete checkout (test card)
- [ ] Redirected to SUCCESS_URL
- [ ] Check Railway logs for `order.created` webhook
- [ ] Check database: `SELECT * FROM bookings ORDER BY created_at DESC LIMIT 1;`
- [ ] Confirmation SMS received

**Test fallback:**
- [ ] Temporarily set `DUFFEL_ACCESS_TOKEN=invalid`
- [ ] Send SMS - should get Kayak links
- [ ] Restore correct token

---

## 📊 Monitor First Week

### Daily Checks

```sql
-- Check bookings
SELECT
  booking_reference,
  passenger_name,
  origin,
  destination,
  total_paid,
  created_at
FROM bookings
ORDER BY created_at DESC
LIMIT 10;

-- Calculate revenue
SELECT
  COUNT(*) as bookings,
  SUM(
    CASE
      WHEN total_paid * 0.03 > 20
      THEN total_paid * 0.03
      ELSE 20
    END
  ) as revenue
FROM bookings
WHERE created_at > NOW() - INTERVAL '7 days';
```

### Watch Railway Logs

**Good signs:**
```
[DuffelLinks] ✅ Session created
[Webhook] Received order.created
[SMS] Confirmation sent
```

**Bad signs:**
```
[DuffelLinks] ❌ Session creation failed
[Webhook] Signature validation failed
```

---

## 🚨 Emergency Rollback

If something breaks:

### Option 1: Disable Duffel Links (Instant)

In Railway environment variables:
```env
DUFFEL_ACCESS_TOKEN=disabled
```

System automatically falls back to Kayak ✅

### Option 2: Git Rollback

```bash
git log --oneline -5  # Find commit before Duffel Links
git revert <commit-hash>
git push origin master
```

Railway auto-deploys old version.

---

## 💡 Pro Tips

### Optimize Conversion

1. **Add urgency:** "Prices may increase - book now!"
2. **Highlight savings:** "Save $50 vs. booking direct"
3. **Social proof:** "10 people booked this route today"

### Marketing Copy

```
✈️ YVR → NRT 12/15

📲 Browse 500+ flights:
https://links.duffel.com/sessions/xxx

✓ Compare ALL airlines
✓ Best price guarantee
✓ Instant confirmation
✓ 24/7 support

Book in 2 minutes. Link expires in 24 hours.
```

### Track Performance

```sql
-- Conversion rate
SELECT
  COUNT(DISTINCT ls.id) as sessions_created,
  COUNT(DISTINCT b.id) as bookings_completed,
  ROUND(
    COUNT(DISTINCT b.id)::numeric / COUNT(DISTINCT ls.id) * 100,
    2
  ) as conversion_rate
FROM link_sessions ls
LEFT JOIN bookings b ON b.link_session_id = ls.id
WHERE ls.created_at > NOW() - INTERVAL '30 days';
```

---

## 📞 Support

**If stuck:**
1. Check `DUFFEL_LINKS_IMPLEMENTATION.md` for detailed guide
2. Check Railway logs for error messages
3. Check Duffel dashboard for session/order status
4. Contact Duffel support (very responsive!)

**Common issues:**
- "401 Unauthorized" → Check `DUFFEL_ACCESS_TOKEN`
- "Links not available" → Contact Duffel to enable
- "Markup not applied" → Verify `markup_rate` + `markup_amount` in code
- "Webhook not received" → Check `DUFFEL_WEBHOOK_SECRET` and subscriptions

---

## 🎯 Success Metrics

**Week 1 Goals:**
- [ ] 5+ test bookings completed
- [ ] 100% webhook success rate
- [ ] 0 booking errors
- [ ] Kayak fallback tested and working

**Month 1 Goals:**
- [ ] 10+ real customer bookings
- [ ] $200+ in markup revenue
- [ ] <1% booking failure rate
- [ ] Customer feedback collected

---

**When you get the email from Duffel, come back to this checklist and go! 🚀**

Total time to activate: ~30 minutes
Revenue starts: Immediately after first booking
