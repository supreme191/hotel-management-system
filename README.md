# Hotel Management System

A comprehensive hotel booking system with payment processing and review functionality.

## Features

### For Users
- **Browse Hotels**: View available hotels with ratings, prices, and amenities
- **Book Hotels**: Select dates, number of rooms, and make reservations
- **Secure Payments**: Integrated Stripe payment processing
- **Review System**: Leave reviews only after confirmed bookings
- **Booking History**: Track all your bookings and their status

### For Admins
- **Hotel Management**: Add, edit, and delete hotels
- **Booking Overview**: View all bookings across the platform
- **User Management**: Admin role assignment during registration

## Tech Stack

- **Backend**: Node.js with Express.js
- **Database**: MongoDB with Mongoose
- **Frontend**: EJS templates with Bootstrap 5
- **Payment**: Stripe integration
- **Authentication**: Session-based with bcrypt password hashing
- **File Upload**: Multer for hotel images

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd hotel-management-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Stripe Configuration (Get from https://stripe.com/docs/keys)
   STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
   STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

   # Database Configuration
   MONGODB_URI=mongodb://127.0.0.1:27017/hotel_app

   # Session Configuration
   SESSION_SECRET=your_super_secret_session_key_here

   # Server Configuration
   PORT=3000
   ```

4. **Set up MongoDB**
   - Install MongoDB locally or use MongoDB Atlas
   - Ensure MongoDB is running on the specified URI

5. **Set up Stripe**
   - Create a Stripe account at https://stripe.com
   - Get your test API keys from the Stripe dashboard
   - Set up a webhook endpoint for payment confirmations

6. **Start the application**
   ```bash
   npm start
   ```

7. **Access the application**
   Open your browser and navigate to `http://localhost:3000`

## Usage

### Admin Setup
1. Register a new account
2. Use the admin code `secret123` during registration to get admin privileges
3. Add hotels with images, pricing, and room information

### User Workflow
1. Register or login to your account
2. Browse available hotels
3. Select a hotel and click "Book Now"
4. Choose dates and number of rooms
5. Complete payment through Stripe
6. View your bookings in "My Bookings"
7. Leave reviews for hotels you've stayed at

### Payment Testing
Use Stripe's test card numbers:
- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- Use any future expiry date and any 3-digit CVC

## API Endpoints

### Authentication
- `GET /register` - Registration form
- `POST /register` - Create new user
- `GET /login` - Login form
- `POST /login` - Authenticate user
- `GET /logout` - Logout user

### Hotels
- `GET /hotels` - List all hotels
- `GET /hotels/new` - New hotel form (admin only)
- `POST /hotels` - Create hotel (admin only)
- `GET /hotels/:id` - Hotel details
- `GET /hotels/:id/edit` - Edit hotel form
- `PUT /hotels/:id` - Update hotel
- `DELETE /hotels/:id` - Delete hotel

### Bookings
- `GET /hotels/:id/book` - Booking form
- `POST /hotels/:id/book` - Create booking
- `GET /my-bookings` - User's bookings
- `GET /admin/bookings` - All bookings (admin only)

### Payments
- `GET /bookings/:id/payment` - Payment form
- `POST /bookings/:id/payment` - Process payment
- `POST /webhook/stripe` - Stripe webhook handler

### Reviews
- `POST /hotels/:id/reviews` - Add review (requires confirmed booking)

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Admin role verification
- Booking ownership validation
- Review authorization (only for confirmed bookings)
- Environment variable configuration

## File Structure

```
├── app.js                 # Main application file
├── package.json          # Dependencies and scripts
├── .env                  # Environment variables
├── public/
│   └── uploads/          # Hotel images
└── views/
    ├── partials/
    │   ├── header.ejs    # Navigation header
    │   └── footer.ejs    # Footer
    ├── index.ejs         # Hotel listing
    ├── show.ejs          # Hotel details
    ├── new.ejs           # Add hotel form
    ├── book.ejs          # Booking form
    ├── payment.ejs       # Payment processing
    ├── my-bookings.ejs   # User bookings
    ├── admin-bookings.ejs # Admin booking overview
    ├── login.ejs         # Login form
    └── register.ejs      # Registration form
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.