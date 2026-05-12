# CPP Institutional Records Management System

This is the Node.js/Express gateway and UI for the CPP application. It serves static files, manages user sessions via Express and HTTP-only cookies, and communicates with the Python Flask backend for data and authentication.

## Requirements
- Node.js 18+
- npm (Node Package Manager)
- Git

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/cpp-student-record.git
   cd cpp-student-record
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root directory (you can copy from the `.env` template if one exists) and configure your server port and email credentials for Nodemailer (used for sending temporary login codes to students).
   ```env
   PORT=3000

   # SMTP / Email Configuration for Nodemailer (Use a Gmail App Password)
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=your_email@gmail.com
   SMTP_PASS=your_16_character_app_password
   ```

## Running the Server

Start the application by running:
```bash
node app.js
```
The server will start on `http://localhost:3000`.

## Features
- **Express Backend:** Acts as an authentication gateway, proxy, and dynamic HTML server.
- **Nodemailer Integration:** Securely dispatches temporary access codes to student emails.
- **HTMX:** Used for dynamic, seamless partial page reloads and transitions without page refreshes.
- **Tailwind CSS:** Styles are managed via the Tailwind CDN configuration within the HTML templates.
