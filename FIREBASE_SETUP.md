# Firebase Setup Guide (Google Sign-In & Cloud Sync)

This adds Google Sign-In and automatic cloud sync of your tier list across all PCs.

## What It Does

1. **Sign in with Google** on your app
2. **Automatically syncs** your tier list (positions, colors, header) to the cloud
3. **Login on another PC** with the same Google account → see your complete tier list
4. **Images stay in Cloudinary** (already set up)

## Setup Instructions

### Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"**
3. Name it `GamersTierMaker` (or anything you want)
4. Click **Continue** through the setup

### Step 2: Enable Google Sign-In

1. In Firebase Console, go to **Build** → **Authentication**
2. Click **Get started**
3. Click **Google** provider
4. Toggle **Enable** to ON
5. Add your email as a test user (or skip, it works without this)
6. Click **Save**

### Step 3: Enable Firestore Database

1. In Firebase Console, go to **Build** → **Firestore Database**
2. Click **Create database**
3. Select region (pick closest to you)
4. Choose **Start in test mode** (for development)
5. Click **Create**

### Step 4: Get Your Firebase Credentials

1. In Firebase Console, click the **Settings icon** (gear) → **Project settings**
2. Scroll down to **Your apps** section
3. Click **Web** icon (or **Add app** if not shown)
4. Copy the config object that looks like:
```javascript
{
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123..."
}
```

### Step 5: Add Credentials to Your App

Open `script.js` and find:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Replace each value with your Firebase credentials from Step 4.

**Example:**
```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDx1234567890abc...",
  authDomain: "gamerstiermaker-abc123.firebaseapp.com",
  projectId: "gamerstiermaker-abc123",
  storageBucket: "gamerstiermaker-abc123.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456ghi789"
};
```

### Step 6: Test It

1. Save the file
2. Refresh your app in the browser
3. Click **"Sign in with Google"** button
4. Sign in with your Google account
5. Your tier list data will auto-sync to Firebase

## How It Works

### On First Login:
- You sign in with Google
- Firebase creates a user account for you
- Your tier list data gets saved to Firestore

### On Another PC:
1. Open the app on a different PC
2. Click **"Sign in with Google"**
3. Sign in with the **same Google account**
4. Your tier list loads automatically (same images, positions, colors)

### Auto-Sync:
- Every time you move an image to a different tier
- Every time you change tier colors
- Every time you modify the header
- Your data automatically saves to Firestore

## Important Security Notes

### For Development (Current Setup):
- Firestore is in **test mode** (less secure but easier to develop)
- Anyone with your database URL could access it
- **Fine for personal use, not for production**

### For Production:
- Change Firestore rules to restrict access to authenticated users only
- In Firebase Console → Firestore → Rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tierLists/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

## Firestore Data Structure

Your tier list data is stored in Firestore like this:

```
tierLists/
  └─ [USER_ID]/
      ├─ header: "Games I played tierlist"
      ├─ tiers: [
      │   { index: 0, name: "S", color: "rgb(255, 127, 127)" },
      │   ...
      │ ]
      ├─ imagePositions: [
      │   { imageId: "img_...", imageSrc: "cloudinary.url", tier: 0 },
      │   ...
      │ ]
      └─ lastUpdated: timestamp
```

## Troubleshooting

### "Firebase not configured" warning
- Check that all Firebase credentials are filled in correctly
- Verify you copied them exactly from Firebase Console
- Check for extra spaces or quotes

### Sign-in button doesn't work
- Make sure Google provider is enabled in Firebase Authentication
- Check browser console (F12) for errors
- Try a different browser

### Data not syncing
- Check that Firestore Database is created and enabled
- Verify you're signed in (check top-right of app)
- Check browser console for errors

### Data syncs but not loading on other PC
- Make sure you sign in with the **same Google account**
- Clear browser cache/cookies and try again
- Check that Firestore has your data (Firebase Console → Firestore)

## Deleting Your Data

To delete all your tier list data from Firebase:

1. Firebase Console → Firestore
2. Click on collection `tierLists`
3. Click on your user ID document
4. Click **Delete document**

Or delete from the app (future feature).

## Privacy

- **Google**: You're using your Google account, data is encrypted in transit
- **Firebase**: Your tier list data is stored on Google's servers
- **Cloudinary**: Your images are stored on Cloudinary's servers
- Only you can access your data (authenticated with your Google account)

## Upgrading Firestore (Optional)

Firebase Firestore free tier includes:
- 1GB storage
- 50,000 reads/day
- 20,000 writes/day

For most hobby projects, this is plenty. If you exceed limits:
- Pay per read/write
- Usually very cheap (<$1/month)

## Next Steps

1. Fill in Firebase credentials in script.js
2. Test signing in and uploading images
3. Test on another PC with same Google account
4. Deploy to production when ready

That's it! Now your tier list syncs everywhere.
