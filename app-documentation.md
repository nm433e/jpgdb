# Japanese Grammar Lookup Application Documentation

## Overview
This is a web application for searching and managing Japanese grammar points from various sources. It features user authentication, data persistence, and filtering capabilities.

## Core Features

### 1. Authentication System
- Uses Firebase Authentication
- Supports Google Sign-in
- Maintains user state between sessions
- Switches between Firebase and localStorage based on authentication status

### 2. Data Management
- Uses Firebase Firestore for authenticated users
- Falls back to localStorage for non-authenticated users
- Manages several types of data:
  - Grammar points read status
  - Filter preferences
  - Lock states for filters
  - Unread-only mode preference

### 3. Search Functionality
- Real-time search as user types
- Supports exact matching with quotes
- Case-insensitive search
- Filters results based on:
  - Selected databases
  - Read/unread status
  - Search term matching

### 4. Database Sources
The application aggregates grammar points from multiple sources:
- Donna Toki
- DOJG (Dictionary of Japanese Grammar)
- HOJGP (Handbook of Japanese Grammar Patterns)
- Nihongo Kyoshi
- Bunpro
- Imabi
- Tae Kim
- Maggie Sensei

### 5. User Interface Components

#### Navigation Bar
- Search input field
- Settings button
- Theme toggle
- Sign in/out buttons

#### Filter Panel
- Toggle All/Untoggle All buttons
- Unread Only toggle
- Individual database filters with lock functionality
- Responsive design (collapsible on mobile)

#### Results Display
- Shows grammar points matching search criteria
- Each result includes:
  - Grammar point title
  - Link to source
  - Read/unread checkbox
  - Visual indicators for source

### 6. Data Persistence

#### User Settings Manager
Handles all data operations with methods for:
- Getting individual settings
- Getting all settings
- Setting individual settings
- Managing filter states
- Managing read status
- Managing lock states

#### Storage Strategy
- Firebase (authenticated users):
  - Stores data in Firestore
  - Syncs across devices
  - Maintains user-specific data
- localStorage (non-authenticated users):
  - Stores data locally
  - Persists between sessions
  - Device-specific

### 7. Responsive Design
- Adapts to different screen sizes
- Mobile-friendly interface
- Collapsible filter panel
- Icon-based navigation on mobile

### 8. Theme Support
- Dark/light theme toggle
- Persists theme preference
- Smooth transitions between themes

## Technical Implementation

### Key Functions

1. `search()`
   - Main search functionality
   - Handles exact and fuzzy matching
   - Applies all filters
   - Updates results in real-time

2. `userSettingsManager`
   - Manages all user preferences
   - Handles data persistence
   - Provides fallback mechanisms

3. `filterData()`
   - Applies multiple filter criteria
   - Handles database selection
   - Manages read status filtering

4. `createResultElement()`
   - Generates result items
   - Handles read status toggling
   - Manages visual feedback

### Event Handling
- Real-time search updates
- Filter state changes
- Authentication state changes
- Responsive design adjustments
- Theme toggling

### Data Flow
1. User input triggers search
2. Application fetches data and settings
3. Filters are applied
4. Results are rendered
5. User interactions update state
6. Changes are persisted to storage

## Security Features
- Firebase authentication
- Secure data storage
- User-specific data isolation
- Safe fallback to localStorage

## Performance Considerations
- Efficient DOM updates using DocumentFragment
- Parallel data fetching
- Cached data access
- Responsive design optimizations 