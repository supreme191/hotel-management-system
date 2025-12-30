# Seed Data Documentation

## How to Populate the Database with Test Data

Visit `http://localhost:3000/seed` to populate your database with dummy data.

## What Gets Created:

### 5 Admin Users:
- **Username**: admin1, admin2, admin3, admin4, admin5
- **Password**: password123 (for all)
- **Role**: Admin (can add/edit/delete hotels)

### 5 Regular Users:
- **Username**: john_doe, jane_smith, mike_wilson, sarah_jones, david_brown
- **Password**: password123 (for all)
- **Role**: Regular user (can book hotels and write reviews)

### 10 Hotels:
1. **Grand Palace Hotel** - $299/night (50 rooms) - Luxury city hotel
2. **Ocean View Resort** - $450/night (30 rooms) - Beachfront resort
3. **Mountain Lodge** - $180/night (25 rooms) - Mountain retreat
4. **City Center Inn** - $150/night (40 rooms) - Business hotel
5. **Boutique Garden Hotel** - $220/night (20 rooms) - Boutique hotel
6. **Skyline Towers** - $380/night (60 rooms) - High-rise luxury
7. **Historic Manor** - $275/night (15 rooms) - Historic mansion
8. **Riverside Retreat** - $195/night (35 rooms) - Riverside hotel
9. **Desert Oasis** - $320/night (25 rooms) - Desert resort
10. **Cozy Corner B&B** - $95/night (12 rooms) - Bed & breakfast

### 10 Bookings:
- Each user has 2 bookings (1 past, 1 future)
- Past bookings are confirmed with completed payments
- Future bookings are confirmed with completed payments
- Realistic check-in/check-out dates and pricing

### Reviews:
- Only past bookings have reviews (realistic scenario)
- High-quality review text with 4-5 star ratings
- Reviews are properly linked to hotels and users

## Test Scenarios:

### As Admin:
1. Login with any admin account (admin1-admin5)
2. Add/edit/delete hotels
3. View all bookings in admin panel
4. Cannot book hotels or write reviews

### As Regular User:
1. Login with any user account (john_doe, jane_smith, etc.)
2. Browse hotels with real data
3. Book available hotels
4. Write reviews for hotels you've booked
5. View your booking history

### Payment Testing:
- Use Stripe test card: `4242 4242 4242 4242`
- All existing bookings show as "Completed" payments
- New bookings will go through Stripe payment flow

## Database Reset:
Running `/seed` again will:
- Clear all existing data
- Recreate fresh dummy data
- Reset all IDs and relationships

## Hotel Images:
- Placeholder images are created automatically
- Images show as "Hotel 1", "Hotel 2", etc.
- You can replace with real images in `/public/uploads/`

## Quick Start:
1. Start your server: `npm start`
2. Visit: `http://localhost:3000/seed`
3. Login with `admin1` / `password123` (admin)
4. Or login with `john_doe` / `password123` (user)
5. Explore the fully populated application!