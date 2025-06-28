# Custom Domain Setup Guide

## Configure api.onetimedating.me to point to Render

### Step 1: Add Custom Domain in Render
1. Go to your Render dashboard
2. Click on your `onetime-backend` service
3. Go to "Settings" tab
4. Scroll to "Custom Domains"
5. Click "Add Custom Domain"
6. Enter: `api.onetimedating.me`
7. Click "Save"

### Step 2: Configure DNS in Hostinger
1. Login to Hostinger
2. Go to DNS management for `onetimedating.me`
3. Add a new CNAME record:
   - **Type**: CNAME
   - **Name**: api
   - **Value**: onetime-backend.onrender.com
   - **TTL**: 300 (or default)

### Step 3: Verify Setup
After 5-15 minutes, test:
```bash
curl https://api.onetimedating.me/health
```

### Step 4: Update Environment Variables
In Render, update these environment variables:
```
API_BASE_URL=https://api.onetimedating.me
CORS_ORIGIN=https://onetimedating.me,https://www.onetimedating.me,https://api.onetimedating.me
```

## SSL Certificate
Render automatically provides SSL certificates for custom domains.
Your API will be available at: https://api.onetimedating.me