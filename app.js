// ==========================================
// HOTEL MANAGEMENT SYSTEM
// ==========================================
// This is the main application entry point.
// Architecture: MVC (Model-View-Controller) pattern.
// - Models: Mongoose schemas in /models directory.
// - Views: EJS templates in /views directory.
// - Controllers: Logic implemented directly in routes below.

// --- IMPORTS ---
const express = require('express');           // Web framework
const app = express();
const bodyParser = require('body-parser');    // Parsing form data
const mongoose = require('mongoose');         // MongoDB ODM
const methodOverride = require('method-override'); // For PUT/DELETE requests from forms
const session = require('express-session');   // Session management for Auth
const multer = require('multer');             // File uploads
const path = require('path');
require('dotenv').config();                   // Load environment variables (.env)

// --- CONFIGURATION ---
console.log('Stripe Secret Key loaded:', process.env.STRIPE_SECRET_KEY ? 'Yes' : 'No');
console.log('Stripe Publishable Key loaded:', process.env.STRIPE_PUBLISHABLE_KEY ? 'Yes' : 'No');

// Initialize Stripe with Secret Key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hotel_app')
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.log("MongoDB Error:" + err));

// App Config
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Essential for parsing Stripe Webhooks (JSON body)
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public')); // Serve static files (CSS, Images)
app.use(methodOverride('_method')); // Allow ?_method=PUT/DELETE in forms

// Session Config (Authentication State)
app.use(session({
    secret: process.env.SESSION_SECRET || 'secretkey',
    resave: false,
    saveUninitialized: false
}));

// --- MODELS ---
// Import Mongoose models to interact with collections
const User = require('./models/user');
const Review = require('./models/review');
const Hotel = require('./models/hotel');
const Booking = require('./models/booking');
const Payment = require('./models/payment');

// --- GLOBAL MIDDLEWARE ---
// Runs on every request.
// Sets 'currentUser' for EJS templates to toggle headers/buttons based on login state.
app.use(async (req, res, next) => {
    res.locals.currentUser = req.session.userId ? await User.findById(req.session.userId) : null;
    next();
});

// Image Upload Configuration (Multer)
// Saves files to 'public/uploads' directory
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ==========================================
//          AUTHORIZATION MIDDLEWARE
// ==========================================

// 1. Check if user is logged in
const isLoggedIn = (req, res, next) => {
    if (req.session.userId) return next();
    res.redirect('/login');
};

// 2. Check if user is an Admin
// Used to protect routes like Creating Hotels or viewing Admin Dashboard.
const isAdmin = async (req, res, next) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        if (user && user.isAdmin) {
            return next();
        }
    }
    res.status(403).send("Access Denied: Only Admins can add or manage hotels.");
};

// 3. Check Hotel Ownership
// Ensures only the Admin who CREATED the hotel can Edit or Delete it.
const checkHotelOwnership = async (req, res, next) => {
    if (req.session.userId) {
        const foundHotel = await Hotel.findById(req.params.id);
        const currentUser = await User.findById(req.session.userId);
        // Strict check: current user ID must equal hotel author ID
        if (foundHotel.author.id.equals(req.session.userId)) {
            next();
        } else {
            res.redirect('back');
        }
    } else {
        res.redirect('back');
    }
};

// ==========================================
//                ROUTES
// ==========================================

// --- LANDING PAGE ---
app.get('/', (req, res) => res.redirect('/hotels'));

// --- STATIC PAGES ---
app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => res.render('contact'));

// --- AUTHENTICATION ROUTES ---
// Functionality: Session-based Auth.
// Login creates a session with userId. Logout destroys it.

app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    const { username, password, adminCode } = req.body;
    // Check for admin Secret Code to grant Admin privileges
    const isAdmin = adminCode === 'secret123';
    const user = await User.create({ username, password, isAdmin });
    req.session.userId = user._id; // Auto-login
    res.redirect('/hotels');
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    // Note: In production, password hashing (bcrypt) should be used instead of plain text!
    if (user && user.password === password) {
        req.session.userId = user._id;
        res.redirect('/hotels');
    } else {
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/hotels');
});


// ==========================================
//             HOTEL ROUTES (RESTful)
// ==========================================

// INDEX - Show all hotels (with Search & Filter)
app.get('/hotels', async (req, res) => {
    const { minRating, maxPrice } = req.query;
    let query = {};
    // Filter logic: MongoDB query operators ($gte, $lte)
    if (minRating) query.averageRating = { $gte: Number(minRating) };
    if (maxPrice) query.price = { $lte: Number(maxPrice) };

    const allHotels = await Hotel.find(query);
    res.render('index', { hotels: allHotels, search: req.query });
});

// NEW - Show form to create hotel (Admin Only)
app.get('/hotels/new', isLoggedIn, isAdmin, (req, res) => res.render('new'));

// CREATE - Add new hotel to DB (Admin Only)
app.post('/hotels', isLoggedIn, isAdmin, upload.single('image'), async (req, res) => {
    const user = await User.findById(req.session.userId);
    const newHotel = {
        name: req.body.name,
        image: '/uploads/' + req.file.filename,
        description: req.body.description,
        price: req.body.price,
        totalRooms: req.body.totalRooms || 10,
        amenities: req.body.amenities ? req.body.amenities.split(',').map(a => a.trim()) : [],
        // Link hotel to the creating Admin
        author: {
            id: user._id,
            username: user.username
        }
    };
    await Hotel.create(newHotel);
    res.redirect('/hotels');
});

// SHOW - Details of a specific hotel
app.get('/hotels/:id', async (req, res) => {
    // Populate reviews to show them on the page
    const hotel = await Hotel.findById(req.params.id).populate('reviews');

    // Logic to check if current user has previously booked this hotel.
    // This is often used to show/hide "Review" buttons (though server-side check happens in POST).
    let hasBooked = false;
    if (req.session.userId) {
        hasBooked = await Booking.findOne({
            hotel: req.params.id,
            user: req.session.userId,
            status: 'confirmed',
            paymentStatus: 'completed'
        });
    }

    res.render('show', { hotel: hotel, hasBooked: !!hasBooked });
});

// EDIT - Show edit form (Owner Only)
app.get('/hotels/:id/edit', isLoggedIn, checkHotelOwnership, async (req, res) => {
    const hotel = await Hotel.findById(req.params.id);
    res.render('edit', { hotel: hotel });
});

// UPDATE - Update hotel details (Owner Only)
app.put('/hotels/:id', isLoggedIn, checkHotelOwnership, async (req, res) => {
    await Hotel.findByIdAndUpdate(req.params.id, req.body.hotel);
    res.redirect('/hotels/' + req.params.id);
});

// DESTROY - Delete hotel (Owner Only)
app.delete('/hotels/:id', isLoggedIn, checkHotelOwnership, async (req, res) => {
    await Hotel.findByIdAndDelete(req.params.id);
    res.redirect('/hotels');
});

// ADMIN DASHBOARD - View "My Hotels"
app.get('/my-hotels', isLoggedIn, async (req, res) => {
    const userHotels = await Hotel.find({ 'author.id': req.session.userId });
    res.render('my-hotels', { hotels: userHotels });
});


// ==========================================
//             REVIEW ROUTES
// ==========================================
// Restrictions:
// 1. Admins cannot review.
// 2. Users can only review hotels they have booked AND paid for (verified stay).
// 3. One review per user per hotel.

app.post('/hotels/:id/reviews', isLoggedIn, async (req, res) => {
    const hotel = await Hotel.findById(req.params.id).populate('reviews');
    const user = await User.findById(req.session.userId);

    // RESTRICTION 1: Self-review / Admin prevention
    if (hotel.author.id.equals(user._id)) return res.send("Cannot review own hotel");
    if (user.isAdmin) return res.send("Admins cannot add reviews");

    // RESTRICTION 2: Verified Stay Check
    // Must find a booking for this user/hotel that is 'confirmed' and 'completed'.
    const hasBooked = await Booking.findOne({
        hotel: req.params.id,
        user: user._id,
        status: 'confirmed',
        paymentStatus: 'completed'
    });
    if (!hasBooked) return res.send("You can only review hotels you have booked and stayed at");

    // RESTRICTION 3: Duplicate Check
    const existing = hotel.reviews.find(r => r.author.id.equals(user._id));
    if (existing) return res.send("Already reviewed");

    // Create Review
    const review = await Review.create({
        text: req.body.text,
        rating: Number(req.body.rating),
        author: { id: user._id, username: user.username }
    });

    hotel.reviews.push(review);
    await hotel.save();

    // LOGIC: Recalculate Average Rating
    // We fetch fresh data to be safe, then reduce to find sum.
    const updatedHotel = await Hotel.findById(req.params.id).populate('reviews');
    const sum = updatedHotel.reviews.reduce((acc, next) => acc + next.rating, 0);
    updatedHotel.averageRating = updatedHotel.reviews.length > 0 ? sum / updatedHotel.reviews.length : 0;
    await updatedHotel.save();

    res.redirect('/hotels/' + hotel._id);
});

// EDIT/DELETE REVIEW - Protected by Ownership Check (Inline)
app.get('/hotels/:id/reviews/:reviewId/edit', isLoggedIn, async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (!review.author.id.equals(req.session.userId)) {
        return res.redirect('back');
    }
    res.render('reviews/edit', { review: review, hotelId: req.params.id });
});

app.put('/hotels/:id/reviews/:reviewId', isLoggedIn, async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (!review.author.id.equals(req.session.userId)) return res.redirect('back');

    await Review.findByIdAndUpdate(req.params.reviewId, {
        text: req.body.text,
        rating: Number(req.body.rating)
    });

    // Recalculate Average Rating after edit
    recalculateHotelRating(req.params.id);

    res.redirect('/hotels/' + req.params.id);
});

app.delete('/hotels/:id/reviews/:reviewId', isLoggedIn, async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (!review.author.id.equals(req.session.userId)) return res.redirect('back');

    // Remove review ID from Hotel's array
    await Hotel.findByIdAndUpdate(req.params.id, {
        $pull: { reviews: req.params.reviewId }
    });

    // Delete actual Review document
    await Review.findByIdAndDelete(req.params.reviewId);

    // Recalculate Average Rating after delete
    recalculateHotelRating(req.params.id);

    res.redirect('/hotels/' + req.params.id);
});

// Helper function for rating recalculation
async function recalculateHotelRating(hotelId) {
    const hotel = await Hotel.findById(hotelId).populate('reviews');
    const sum = hotel.reviews.reduce((acc, next) => acc + next.rating, 0);
    hotel.averageRating = hotel.reviews.length > 0 ? sum / hotel.reviews.length : 0;
    await hotel.save();
}


// ==========================================
//             BOOKING ROUTES
// ==========================================

// BOOKING FORM
app.get('/hotels/:id/book', isLoggedIn, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (user.isAdmin) return res.send("Admins cannot book hotels");
    const hotel = await Hotel.findById(req.params.id);
    res.render('book', { hotel });
});

// CREATE BOOKING (Logic: Availability Check & Price Calc)
app.post('/hotels/:id/book', isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (user.isAdmin) return res.send("Admins cannot book hotels");

        const { checkInDate, checkOutDate, numberOfRooms } = req.body;
        const hotel = await Hotel.findById(req.params.id);

        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const today = new Date();

        // 1. Basic Validation
        if (checkIn < today || checkOut <= checkIn) {
            return res.send("Invalid dates");
        }

        // 2. Availability Check Logic
        // We find all bookings that OVERLAP with the requested dates.
        // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
        const existingBookings = await Booking.find({
            hotel: req.params.id,
            status: 'confirmed', // Only count confirmed bookings
            $or: [
                { checkInDate: { $lte: checkOut }, checkOutDate: { $gte: checkIn } }
            ]
        });

        // Sum up rooms used in overlapping bookings
        const bookedRooms = existingBookings.reduce((sum, booking) => sum + booking.numberOfRooms, 0);
        const availableRooms = hotel.totalRooms - bookedRooms;

        if (numberOfRooms > availableRooms) {
            return res.send(`Only ${availableRooms} rooms available for these dates`);
        }

        // 3. Price Calculation
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        const totalPrice = hotel.price * numberOfRooms * nights;

        // 4. Create Booking (Pending Payment)
        const booking = await Booking.create({
            hotel: req.params.id,
            user: user._id,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            numberOfRooms: parseInt(numberOfRooms),
            totalPrice
        });

        // Redirect to Payment Page
        res.redirect(`/bookings/${booking._id}/payment`);
    } catch (error) {
        console.error(error);
        res.send("Booking failed");
    }
});


// ==========================================
//             PAYMENT ROUTES (Stripe)
// ==========================================
// Flow:
// 1. Render Payment Page with Stripe Elements.
// 2. Client sends payment details to Stripe.
// 3. Server creates PaymentIntent.
// 4. Stripe confirms payment via Webhook (async) or Client callback (sync).

app.get('/bookings/:id/payment', isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('hotel user');
    if (!booking || !booking.user._id.equals(req.session.userId)) {
        return res.redirect('/hotels');
    }

    if (!process.env.STRIPE_PUBLISHABLE_KEY || !process.env.STRIPE_SECRET_KEY) {
        return res.send('Stripe keys are not configured. Please check your .env file.');
    }

    res.render('payment', {
        booking,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
});

app.post('/bookings/:id/payment', isLoggedIn, async (req, res) => {
    try {
        console.log('Payment route hit for booking:', req.params.id);
        const booking = await Booking.findById(req.params.id).populate('hotel user');

        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        if (!booking.user._id.equals(req.session.userId)) return res.status(403).json({ error: 'Unauthorized' });

        // Create Stripe PaymentIntent
        // This reserves the money and prepares the transaction.
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(booking.totalPrice * 100), // Stripe uses cents
            currency: 'usd',
            // Metadata is key! This allows us to ID the booking in the Webhook later.
            metadata: {
                bookingId: booking._id.toString()
            }
        });

        // Save Intent ID to booking for tracking
        booking.paymentIntentId = paymentIntent.id;
        await booking.save();

        // Record initial payment attempt
        await Payment.create({
            booking: booking._id,
            user: booking.user._id,
            amount: booking.totalPrice,
            paymentIntentId: paymentIntent.id
        });

        // Send Client Secret to frontend to finalize payment
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Payment route error:', error);
        res.status(500).json({ error: 'Payment processing failed: ' + error.message });
    }
});

// STRIPE WEBHOOK
// This is the robust way to confirm payments. Stripe calls THIS URL when payment succeeds.
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        // Verify signature to ensure request actually came from Stripe
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle 'payment_intent.succeeded' event
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata.bookingId; // Retrieved from metadata

        console.log('Webhook: Payment succeeded for booking:', bookingId);

        // Update DB: Mark Booking as Confirmed
        await Booking.findByIdAndUpdate(bookingId, {
            status: 'confirmed',
            paymentStatus: 'completed'
        });

        // Update Payment Record
        await Payment.findOneAndUpdate(
            { paymentIntentId: paymentIntent.id },
            { status: 'succeeded' }
        );

        console.log('Webhook: Booking status updated to confirmed');
    }

    res.json({ received: true });
});

// SUCCESS PAGE (Fallback)
// User is redirected here after successful payment if webhook is delayed or for UI feedback.
app.get('/payment-success', isLoggedIn, async (req, res) => {
    try {
        const bookingId = req.query.booking_id;
        if (!bookingId) return res.redirect('/my-bookings');

        const booking = await Booking.findById(bookingId);
        if (!booking || !booking.user.equals(req.session.userId)) return res.redirect('/my-bookings');

        // Double check updates (redundant if webhook worked, but safe)
        booking.status = 'confirmed';
        booking.paymentStatus = 'completed';
        await booking.save();

        await Payment.findOneAndUpdate(
            { booking: bookingId },
            { status: 'succeeded' }
        );

        res.redirect('/my-bookings?payment=success');
    } catch (error) {
        res.redirect('/my-bookings?payment=error');
    }
});


// ==========================================
//           USER & ADMIN MANAGEMENT
// ==========================================

// USER BOOKINGS - "My Bookings"
app.get('/my-bookings', isLoggedIn, async (req, res) => {
    const bookings = await Booking.find({ user: req.session.userId })
        .populate('hotel')
        .sort({ createdAt: -1 });
    res.render('my-bookings', { bookings, query: req.query });
});

// CANCEL BOOKING
app.post('/bookings/:id/cancel', isLoggedIn, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking || !booking.user.equals(req.session.userId)) return res.redirect('/my-bookings');
        if (booking.status === 'cancelled') return res.send("Booking is already cancelled");

        // Logic: Cannot cancel within 1 week of check-in
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

        if (booking.checkInDate <= oneWeekFromNow) {
            return res.send("Cannot cancel booking within 1 week of check-in date");
        }

        booking.status = 'cancelled';
        await booking.save();
        res.redirect('/my-bookings');
    } catch (error) {
        res.send("Cancellation failed");
    }
});

// ADMIN BOOKINGS - "All Bookings" (For Admin's Hotels only)
app.get('/admin/bookings', isLoggedIn, isAdmin, async (req, res) => {
    // 1. Find all hotels created by this admin
    const adminHotels = await Hotel.find({ 'author.id': req.session.userId });
    const hotelIds = adminHotels.map(h => h._id);

    // 2. Find bookings ONLY for these hotels
    const bookings = await Booking.find({ hotel: { $in: hotelIds } })
        .populate('hotel user')
        .sort({ createdAt: -1 });

    res.render('admin-bookings', { bookings });
});

// UTILS
// Serve default image (fallback route)
app.get('/uploads/hotel-:id.jpg', (req, res) => {
    res.redirect('https://via.placeholder.com/400x200/0066cc/ffffff?text=Hotel+' + req.params.id);
});

// Start Server
app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));