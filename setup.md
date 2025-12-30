# Quick Setup Guide

## 1. Install Dependencies
```bash
npm install
```

## 2. Set up Environment Variables
Copy the `.env` file and update with your actual values:

### Stripe Setup (Required for payments)
1. Go to https://stripe.com and create an account
2. Get your test API keys from the dashboard
3. Replace the placeholder values in `.env`:
   - `STRIPE_SECRET_KEY`: Your secret key (starts with `sk_test_`)
   - `STRIPE_PUBLISHABLE_KEY`: Your publishable key (starts with `pk_test_`)
   - `STRIPE_WEBHOOK_SECRET`: Set up a webhook endpoint (optional for basic testing)

### MongoDB Setup
- If using local MongoDB: Keep the default `MONGODB_URI`
- If using MongoDB Atlas: Replace with your connection string

## 3. Start the Application
```bash
node app.js
```

## 4. Test the Application

### Create Admin Account
1. Go to http://localhost:3000/register
2. Use admin code: `secret123`
3. This gives you admin privileges to add hotels

### Add a Hotel
1. Login as admin
2. Click "Add Hotel" in the navigation
3. Fill in hotel details including room count and amenities

### Test Booking Flow
1. Register a regular user account
2. Browse hotels and click "Book Now"
3. Select dates and rooms
4. Use Stripe test card: `4242 4242 4242 4242`

### Test Review System
1. Complete a booking with successful payment
2. Go to the hotel page
3. You can now leave a review

## Features Implemented

✅ **Admin Hotel Management**
- Add hotels with images, pricing, room count, amenities
- Edit and delete hotels
- View all bookings across platform

✅ **User Booking System**
- Date-based room availability checking
- Real-time price calculation
- Booking confirmation and tracking

✅ **Stripe Payment Integration**
- Secure payment processing
- Payment status tracking
- Webhook support for payment confirmation

✅ **Review System with Authorization**
- Users can only review hotels they've booked
- Prevents duplicate reviews
- Hotel owners cannot review their own hotels

✅ **Security Features**
- Password hashing with bcrypt
- Session-based authentication
- Role-based access control
- Environment variable configuration

## Troubleshooting

### Payment Issues
- Ensure Stripe keys are correctly set in `.env`
- Use test card numbers from Stripe documentation
- Check browser console for JavaScript errors

### Database Issues
- Ensure MongoDB is running
- Check connection string in `.env`
- Verify database permissions

### Authentication Issues
- Clear browser cookies/session storage
- Check session secret in `.env`
- Verify user registration process