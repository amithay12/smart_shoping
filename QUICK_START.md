# Quick Start Guide - Testing Backend

## ✅ Step 1: Start Backend Server

```bash
cd backend
npm run dev
```

**Expected output:**
```
Server running in development mode on port 5001
MongoDB Connected: ...
```

**Keep this terminal running!**

---

## ✅ Step 2: Verify Stores Were Created

In a **new terminal**:

```bash
cd backend
node scripts/testBackend.js
```

Or manually test:

```bash
# Get all stores
curl http://localhost:5001/api/stores

# Should return JSON with 6 Israeli stores
```

---

## ✅ Step 3: Test Endpoints

### Option A: Use the Test Script
```bash
cd backend
node scripts/testBackend.js
```

### Option B: Manual Testing

**1. Test Stores:**
```bash
curl http://localhost:5001/api/stores
```

**2. Test Barcode Lookup:**
```bash
curl http://localhost:5001/api/products/barcode/7290000064228
```

**3. Test Product Search:**
```bash
curl "http://localhost:5001/api/products/search?q=milk"
```

**4. Test Stores Near Location (Tel Aviv):**
```bash
curl "http://localhost:5001/api/stores?lat=32.0853&lng=34.7818&maxDistance=10"
```

---

## ✅ Step 4: Test Basket Optimization (Requires Auth)

You'll need:
1. A Firebase auth token
2. Products linked to your shopping list
3. Prices added to stores

See `BACKEND_TESTING_GUIDE.md` for detailed instructions.

---

## 🎯 Next: Frontend Components

Once backend is verified, we'll build:
1. Barcode Scanner Component
2. Product Search Screen  
3. Store Comparison Screen

---

**Troubleshooting:**
- If server won't start: Check MongoDB connection in `.env`
- If endpoints fail: Make sure server is running on port 5001
- If stores not found: Run `node scripts/seedStores.js` again

