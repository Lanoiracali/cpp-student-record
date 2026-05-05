# CPP Frontend Web App

This is the Node.js/Express gateway and UI for the CPP application. It serves static files, manages user sessions via Express and HTTP-only cookies, and communicates with the Python Flask backend for data and authentication.

## Requirements
- Node.js 18+
- npm (Node Package Manager)

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server

Start the application by running:
```bash
node app.js
```
The server will start on `http://localhost:3000`.

## Features
- **Express Backend:** Acts as an authentication gateway, proxy, and dynamic HTML server.
- **HTMX:** Used for dynamic, seamless partial page reloads and transitions without page refreshes.
- **Tailwind CSS:** Styles are managed via the Tailwind CDN configuration within the HTML templates.
