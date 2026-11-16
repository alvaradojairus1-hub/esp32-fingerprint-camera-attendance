# FasTap - Fingerprint Attendance System Tracker and Payroll

FasTap is a modern, IoT-based fingerprint attendance and payroll management system designed for businesses of all sizes. It combines biometric authentication with flexible employee management and automated payroll processing.

## Features

### 🔐 Biometric Authentication
- Secure fingerprint-based attendance tracking
- Real-time synchronization with central database
- Support for multiple biometric devices
- Offline capability with automatic sync

### 👥 Employee Management
- Dynamic employee type configuration
- Customizable departments and positions
- Profile management with photo upload
- Role-based access control

### ⏰ Attendance Tracking
- Real-time attendance monitoring
- Flexible work schedule configuration
- Leave management system
- Overtime tracking
- Late arrival and early departure monitoring

### 💰 Payroll System
- Automated salary computation
- Support for multiple payment schemes:
  - Monthly fixed rate
  - Daily rate
  - Hourly rate
  - Custom computation rules
- Overtime and deduction rules
- Allowance and bonus management

### ⚙️ Company Settings
- Customizable company profile
- Working hours configuration
- Holiday calendar management
- Department structure
- Employee type definitions

### 📊 Reports and Analytics
- Attendance summary reports
- Payroll reports
- Employee performance metrics
- Exportable data in multiple formats

## Technical Stack

- Frontend: React with Vite
- Backend: Firebase
  - Realtime Database
  - Cloud Functions
  - Authentication
- IoT Integration: Custom firmware for fingerprint devices
- Styling: Tailwind CSS
- State Management: React Context
- Charts: Chart.js

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Firebase CLI
- IoT device with fingerprint sensor

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/fastap.git
cd fastap
```

2. Install dependencies:
```bash
npm install
```

3. Set up Firebase:
```bash
npm install -g firebase-tools
firebase login
firebase init
```

4. Configure environment variables:
Create a `.env.local` file with your Firebase configuration:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_DATABASE_URL=your_database_url
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

5. Start the development server:
```bash
npm run dev
```

### Initial Setup

1. Create an admin account
2. Configure company settings
3. Set up employee types
4. Configure work schedules
5. Add departments and positions
6. Enroll employees

## Documentation

- [User Guide](./docs/USER_GUIDE.md)
- [Admin Guide](./docs/ADMIN_GUIDE.md)
- [API Documentation](./docs/API.md)
- [Database Schema](./docs/SCHEMA.md)
- [IoT Device Setup](./docs/IOT_SETUP.md)

## Security

FasTap implements multiple security measures:

- Secure biometric data handling
- Role-based access control
- Encrypted data transmission
- Regular security audits
- Backup and recovery procedures

## Support

For technical support or questions, please:

1. Check the [documentation](./docs)
2. Search [existing issues](../../issues)
3. Create a new issue if needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.