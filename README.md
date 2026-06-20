# Tiko Zetu - Event Ticketing Platform

A modern, web-based event ticketing and booking platform for Kenya. Discover events, book tickets, and receive digital QR-coded tickets for fast and secure entry verification.

## Features

- **Attendees**: Browse/search events, filter by category/location/price, purchase tickets, get QR-coded digital tickets
- **Organizers**: Create and manage events with full details (title, description, location, date, time, pricing, ticket availability)
- **Admins**: Manage users and events, approve/reject listings, verify tickets via QR scanning, monitor system activity

## Tech Stack

- **Frontend**: HTML5, CSS3 (mobile-first responsive), Vanilla JavaScript
- **Backend**: Flask, SQLAlchemy, Flask-Login
- **Database**: SQLite
- **QR Codes**: `qrcode` library with Pillow

## Setup

```bash
# Clone the repository
git clone https://github.com/kevinke3/tiko-zetu.git
cd tiko-zetu

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Run the application
cd backend
python app.py
```

Visit `http://localhost:5000` in your browser.

## Demo Accounts

| Role      | Username   | Password      |
|-----------|------------|---------------|
| Admin     | admin      | admin123      |
| Organizer | events_ke  | organizer123  |
| Attendee  | jane_doe   | attendee123   |

## Project Structure

```
tiko-zetu/
├── backend/
│   ├── app.py              # Flask application & API routes
│   ├── models.py           # SQLAlchemy database models
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── index.html          # Single-page application
│   ├── css/
│   │   └── styles.css      # Modern responsive stylesheet
│   └── js/
│       ├── api.js          # API client wrapper
│       └── app.js          # Application logic & UI
├── instance/               # SQLite database (auto-created)
├── .env.example            # Environment variables template
└── README.md
```
