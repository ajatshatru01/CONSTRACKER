# [CONSTRACKER](https://constracker.onrender.com)
This is live at https://constracker.onrender.com 

# Multi-Participant Live Location Tracker

A consent-based live location tracker where:

- You create one session.
- You generate multiple participant links, each with a unique identifier.
- Each participant opens their own link, gives consent, and shares live location.
- Your dashboard shows all active participants in real time.

## Tech Stack

- Frontend: Vite + React
- Backend: Express + `ws` WebSocket server

## Project Structure

- `frontend/` - Dashboard UI and participant tracking page (`track.html`)
- `backend/` - API + WebSocket server

## How To Use

1. Open the [dashboard](https://constracker.onrender.com) in your browser. 
2. Click **Create session**.
3. Add a participant identifier (example: `alex-phone`) and generate a link.
4. Repeat for each participant.
5. Send each participant their own generated link.
6. Participant opens link and taps consent to start sharing.
7. Dashboard updates live with a separate card per identifier.
