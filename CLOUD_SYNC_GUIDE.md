# Cloud Sync Features

## Overview
The Gamers Tier Maker now saves all game data to your Google account using Firebase, allowing you to access your tier list from any device.

## What Gets Synced to the Cloud

When you sign in with your Google account, the following information is automatically saved and synced across all devices:

1. **Game Information:**
   - Game name
   - Date beaten/played/dropped
   - Game description
   - Completion status (Not Started, Played, Completed, Dropped)
   - Gaming platform (PC, PlayStation, Xbox, Nintendo, etc.)

2. **Tier List Structure:**
   - Tier names and colors
   - Game positions within each tier
   - Tier list title

3. **Game Images:**
   - All game cover images

## How to Use Cloud Sync

### Sign In
1. Click the "Sign in with Google" button in the top-right corner
2. Select your Google account
3. Grant permission for the app to save your data

### Automatic Syncing
- **Game Details:** When you edit a game's name, date, description, status, or platform, the changes are automatically saved to your account when you close the game details modal
- **Tier Changes:** When you move games between tiers or change tier names/colors, the changes are synced automatically
- **New Games:** When you add new games, they are synced to your account

### Accessing Your Data on Another Device
1. Sign in with the same Google account on another device
2. Your complete tier list, including all game details, will automatically load

### Sign Out
- Click the "Sign Out" button to disconnect your Google account
- Your local data remains on your device, but cloud syncing will be disabled

## Data Privacy
- Your data is stored securely in Firebase, associated with your Google account
- Only you can access your data - it's private to your account
- You can sign out at any time to stop cloud syncing

## Offline Usage
- You can still use the app while offline
- Changes are saved locally
- When you sign back in, changes will be synced to the cloud
