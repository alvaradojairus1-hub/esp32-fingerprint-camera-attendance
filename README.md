# ESP32 Fingerprint Attendance and Camera System

A full-stack attendance and monitoring system built around ESP32 devices for fingerprint-based check-in/check-out and camera capture. The repository contains firmware for two ESP32 modules plus a web dashboard for managing attendance, payroll, and employee records.

## Overview

This project combines:

- ESP32 fingerprint sensor firmware for biometric validation
- ESP32 camera firmware for image capture and upload
- A React + Firebase dashboard for managing attendance data and payroll
- A PHP/HTML web front-end for simple access and hosting scenarios

The system is designed for attendance tracking in a workplace, school, or facility where employees or students need a reliable, tamper-resistant check-in mechanism.

## System Architecture

```text
+------------------+        +----------------------+
| ESP32 Fingerprint| -----> | Attendance Dashboard |
| Sensor Module    |        | (React + Firebase)   |
+------------------+        +----------+-----------+
       |                                  |
       v                                  v
+------------------+              +----------------------+
| ESP32 Camera     |              | Employee Records     |
| Capture Module   |              | Payroll / Reports    |
+------------------+              +----------------------+
```

## Repository Structure

```text
ESP32-fingerprint-camera-attendance/
├── ESP32_Fingerprint/
│   ├── final_fingerprint.ino
│   └── secrets.h
├── ESP32_camera/
│   ├── Base64.cpp
│   ├── Base64.h
│   └── final_camera.ino
├── public_html/
│   ├── .htaccess
│   ├── index.html
│   └── assets/
├── CapstoneTest/
│   ├── src/
│   ├── functions/
│   ├── public/
│   ├── docs/
│   ├── package.json
│   ├── firebase.json
│   ├── .env.example
│   ├── README.md
│   └── ...
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── LICENSE (if added later)
```

## Features

### Biometric attendance
- Fingerprint-based identity verification
- Attendance marking for check-in/check-out events
- Support for multiple users and enrollment workflows

### Camera capture
- Real-time image capture from ESP32 camera modules
- Base64 or HTTP-friendly image handling for transmission
- Visual verification for attendance events

### Attendance dashboard
- Employee and department management
- Attendance monitoring and reports
- Payroll-related processing and summaries
- Firebase-backed data synchronization

### Deployment flexibility
- Local development for the dashboard
- Firebase hosting/deployment support
- Static hosting options through `public_html`

## Hardware Components

This project is intended for use with:

- ESP32 development boards
- Fingerprint sensor modules compatible with ESP32 firmware
- ESP32-CAM or similar camera-enabled ESP32 boards
- Wi-Fi network connectivity
- Optional power supply and enclosure for field installation

## Software Stack

- Firmware: Arduino / ESP32 C++
- Dashboard: React + Vite
- Backend/services: Firebase Realtime Database / Firebase Functions
- Web hosting: static HTML + Apache-compatible config

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/alvaradojairus1-hub/esp32-fingerprint-camera-attendance.git
cd esp32-fingerprint-camera-attendance
```

### 2. Set up the dashboard

```bash
cd CapstoneTest
npm install
```

Create a local environment file by copying `.env.example` and filling in your Firebase/project settings:

```bash
cp .env.example .env
```

Then run the dashboard locally:

```bash
npm run dev
```

### 3. Build the dashboard for deployment

```bash
npm run build
```

For Firebase hosting or cloud functions, follow the configuration in `CapstoneTest/firebase.json` and the documentation inside `CapstoneTest/`.

## ESP32 Firmware Setup

### Fingerprint module

Open the file:

```text
ESP32_Fingerprint/final_fingerprint.ino
```

Then:

1. Open it in Arduino IDE or PlatformIO
2. Install ESP32 board support
3. Configure Wi-Fi credentials and device settings
4. Upload the sketch to the ESP32 fingerprint device

The fingerprint module uses `secrets.h` for sensitive configuration values such as network credentials and related environment data.

### Camera module

Open the file:

```text
ESP32_camera/final_camera.ino
```

This module is intended for capturing and transmitting the camera image data used in verification or attendance workflows. It includes base64 helpers for image formatting and transmission.

## Deployment Notes

### Website/static hosting

The `public_html` folder contains a basic static deployment area and `.htaccess` support for server-side hosting.

### Firebase dashboard

The `CapstoneTest` project is the main web application and includes Firebase configuration, project docs, and deployment scripts.

## Documentation

The dashboard project includes additional technical documentation in:

- `CapstoneTest/README.md`
- `CapstoneTest/docs/`
- `CapstoneTest/*.md`

These files include project notes, attendance logic explanations, payroll integration details, and deployment instructions.

## Notes

- This repository is primarily a hardware + software prototype/integration project.
- Credentials, API keys, and local secrets should never be committed to version control.
- If you deploy to a production environment, ensure secure access controls and proper validation for attendance data.

## Project Status

This repository contains working firmware modules and a web dashboard prototype for attendance tracking. It is intended for continued development, hardware testing, and deployment customization.

## License

No explicit license file was found in the repository root at the time of writing. If you plan to publish or distribute this project, consider adding an appropriate open-source license before sharing it publicly.

## Contributing

Contributions are welcome. You can:

- improve the firmware logic
- add robust validation for attendance data
- extend the dashboard with new reporting features
- optimize camera upload and synchronization flows

If you are working from a local fork, submit changes through a pull request after testing the relevant modules.
