const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const methodOverride = require('method-override');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

console.log('Stripe Secret Key loaded:', process.env.STRIPE_SECRET_KEY ? 'Yes' : 'No');
console.log('Stripe Publishable Key loaded:', process.env.STRIPE_PUBLISHABLE_KEY ? 'Yes' : 'No');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hotel_app')
    .then(() => console.log("Connected"))
    .catch((err) => console.log("Error:" + err));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // For Stripe webhooks
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(methodOverride('_method'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'secretkey',
    resave: false,
    saveUninitialized: false
}));

// Global Variable Middleware
app.use(async (req, res, next) => {
    res.locals.currentUser = req.session.userId ? await User.findById(req.session.userId) : null;
    next();
});

// Image Upload Config
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- MODELS ---
const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    isAdmin: { type: Boolean, default: false }
});
const User = mongoose.model('User', userSchema);

const reviewSchema = new mongoose.Schema({
    text: String,
    rating: Number,
    author: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String
    }
});
const Review = mongoose.model('Review', reviewSchema);

const hotelSchema = new mongoose.Schema({
    name: String,
    image: String,
    description: String,
    price: Number,
    totalRooms: { type: Number, default: 10 },
    amenities: [String],
    averageRating: { type: Number, default: 0 },
    author: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String
    },
    reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Review' }]
});
const Hotel = mongoose.model('Hotel', hotelSchema);

// Booking Model
const bookingSchema = new mongoose.Schema({
    hotel: { type: mongoose.Schema.Types.ObjectId, ref: 'Hotel', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    checkInDate: { type: Date, required: true },
    checkOutDate: { type: Date, required: true },
    numberOfRooms: { type: Number, required: true, min: 1 },
    totalPrice: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
    paymentStatus: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    paymentIntentId: String,
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

// Payment Model
const paymentSchema = new mongoose.Schema({
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'usd' },
    paymentIntentId: { type: String, required: true },
    status: { type: String, enum: ['pending', 'succeeded', 'failed'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});
const Payment = mongoose.model('Payment', paymentSchema);

// --- MIDDLEWARE ---

const isLoggedIn = (req, res, next) => {
    if (req.session.userId) return next();
    res.redirect('/login');
};

// UPDATED: isAdmin middleware now checks the database based on session ID
const isAdmin = async (req, res, next) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        if (user && user.isAdmin) {
            return next();
        }
    }
    res.status(403).send("Access Denied: Only Admins can add or manage hotels.");
};

const checkHotelOwnership = async (req, res, next) => {
    if (req.session.userId) {
        const foundHotel = await Hotel.findById(req.params.id);
        const currentUser = await User.findById(req.session.userId);
        if (foundHotel.author.id.equals(req.session.userId) || currentUser.isAdmin) {
            next();
        } else {
            res.redirect('back');
        }
    } else {
        res.redirect('back');
    }
};

// --- ROUTES ---

app.get('/', (req, res) => res.redirect('/hotels'));

app.get('/about', (req, res) => res.render('about'));
app.get('/contact', (req, res) => {
    console.log('Contact route hit');
    res.render('contact');
});

// Test route to verify Stripe configuration
app.get('/test-stripe', (req, res) => {
    res.json({
        stripeConfigured: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PUBLISHABLE_KEY),
        secretKeyPresent: !!process.env.STRIPE_SECRET_KEY,
        publishableKeyPresent: !!process.env.STRIPE_PUBLISHABLE_KEY
    });
});

// Seed route to populate database with dummy data
app.get('/seed', async (req, res) => {
    try {
        // Clear existing data
        await User.deleteMany({});
        await Hotel.deleteMany({});
        await Booking.deleteMany({});
        await Review.deleteMany({});
        await Payment.deleteMany({});

        console.log('Cleared existing data');

        // Create 5 dummy admins
        const admins = [];
        for (let i = 1; i <= 5; i++) {
            const admin = await User.create({
                username: `admin${i}`,
                password: 'password123',
                isAdmin: true
            });
            admins.push(admin);
        }
        console.log('Created 5 admins');

        // Create 5 regular users
        const users = [];
        const userNames = ['sameer', 'saurabh', 'gajanan', 'saish', 'ahmed'];
        for (let i = 0; i < 5; i++) {
            const user = await User.create({
                username: userNames[i],
                password: 'password123',
                isAdmin: false
            });
            users.push(user);
        }
        console.log('Created 5 regular users');

        // Hotel data
        const hotelData = [
            {
                name: 'Grand Palace Hotel',
                description: 'Luxury hotel in the heart of the city with world-class amenities and exceptional service.',
                price: 299,
                totalRooms: 50,
                amenities: ['WiFi', 'Pool', 'Gym', 'Spa', 'Restaurant', 'Room Service']
            },
            {
                name: 'Ocean View Resort',
                description: 'Beautiful beachfront resort with stunning ocean views and private beach access.',
                price: 450,
                totalRooms: 30,
                amenities: ['WiFi', 'Beach Access', 'Pool', 'Restaurant', 'Bar', 'Water Sports']
            },
            {
                name: 'Mountain Lodge',
                description: 'Cozy mountain retreat perfect for nature lovers and adventure seekers.',
                price: 180,
                totalRooms: 25,
                amenities: ['WiFi', 'Fireplace', 'Hiking Trails', 'Restaurant', 'Parking']
            },
            {
                name: 'City Center Inn',
                description: 'Modern hotel in downtown area, perfect for business travelers and city explorers.',
                price: 150,
                totalRooms: 40,
                amenities: ['WiFi', 'Business Center', 'Gym', 'Restaurant', 'Parking']
            },
            {
                name: 'Boutique Garden Hotel',
                description: 'Charming boutique hotel with beautiful gardens and personalized service.',
                price: 220,
                totalRooms: 20,
                amenities: ['WiFi', 'Garden', 'Restaurant', 'Spa', 'Pet Friendly']
            },
            {
                name: 'Skyline Towers',
                description: 'High-rise hotel with panoramic city views and modern luxury amenities.',
                price: 380,
                totalRooms: 60,
                amenities: ['WiFi', 'Sky Bar', 'Pool', 'Gym', 'Concierge', 'Valet Parking']
            },
            {
                name: 'Historic Manor',
                description: 'Restored historic mansion offering elegant accommodations with old-world charm.',
                price: 275,
                totalRooms: 15,
                amenities: ['WiFi', 'Historic Tours', 'Restaurant', 'Library', 'Gardens']
            },
            {
                name: 'Riverside Retreat',
                description: 'Peaceful riverside hotel perfect for relaxation and outdoor activities.',
                price: 195,
                totalRooms: 35,
                amenities: ['WiFi', 'River Access', 'Fishing', 'Restaurant', 'Kayak Rental']
            },
            {
                name: 'Desert Oasis',
                description: 'Unique desert resort offering luxury in a stunning natural setting.',
                price: 320,
                totalRooms: 25,
                amenities: ['WiFi', 'Pool', 'Spa', 'Desert Tours', 'Restaurant', 'Star Gazing']
            },
            {
                name: 'Cozy Corner B&B',
                description: 'Family-run bed and breakfast with homemade meals and warm hospitality.',
                price: 95,
                totalRooms: 12,
                amenities: ['WiFi', 'Breakfast Included', 'Garden', 'Pet Friendly', 'Parking']
            }
        ];

        // Create 10 hotels (2 per admin)
        const hotels = [];
        for (let i = 0; i < 10; i++) {
            const adminIndex = Math.floor(i / 2); // 2 hotels per admin
            const hotel = await Hotel.create({
                name: hotelData[i].name,
                image: `/uploads/hotel-${i + 1}.jpg`, // Placeholder image path
                description: hotelData[i].description,
                price: hotelData[i].price,
                totalRooms: hotelData[i].totalRooms,
                amenities: hotelData[i].amenities,
                author: {
                    id: admins[adminIndex]._id,
                    username: admins[adminIndex].username
                },
                averageRating: 0,
                reviews: []
            });
            hotels.push(hotel);
        }
        console.log('Created 10 hotels');

        // Create placeholder hotel images (you can replace these with actual images later)
        const fs = require('fs');
        const uploadsDir = './public/uploads';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Create simple placeholder image files (these will be empty files for now)
        for (let i = 1; i <= 10; i++) {
            const imagePath = `${uploadsDir}/hotel-$
            
            {i}.jpg`;
            if (!fs.existsSync(imagePath)) {
                fs.writeFileSync(imagePath, ''); // Create empty file as placeholder
            }
        }
        console.log('Created placeholder hotel images');

        // Create bookings for users
        const bookings = [];
        const bookingData = [
            { userIndex: 0, hotelIndex: 0, daysFromNow: -30, nights: 3, rooms: 1 }, // Past booking
            { userIndex: 0, hotelIndex: 2, daysFromNow: 15, nights: 2, rooms: 1 },   // Future booking
            { userIndex: 1, hotelIndex: 1, daysFromNow: -45, nights: 5, rooms: 2 }, // Past booking
            { userIndex: 1, hotelIndex: 4, daysFromNow: 30, nights: 4, rooms: 1 },   // Future booking
            { userIndex: 2, hotelIndex: 3, daysFromNow: -20, nights: 2, rooms: 1 }, // Past booking
            { userIndex: 2, hotelIndex: 6, daysFromNow: 45, nights: 3, rooms: 2 },   // Future booking
            { userIndex: 3, hotelIndex: 5, daysFromNow: -60, nights: 7, rooms: 1 }, // Past booking
            { userIndex: 3, hotelIndex: 8, daysFromNow: 20, nights: 3, rooms: 1 },   // Future booking
            { userIndex: 4, hotelIndex: 7, daysFromNow: -15, nights: 4, rooms: 2 }, // Past booking
            { userIndex: 4, hotelIndex: 9, daysFromNow: 60, nights: 2, rooms: 1 }    // Future booking
        ];

        for (const bookingInfo of bookingData) {
            const checkInDate = new Date();
            checkInDate.setDate(checkInDate.getDate() + bookingInfo.daysFromNow);
            const checkOutDate = new Date(checkInDate);
            checkOutDate.setDate(checkOutDate.getDate() + bookingInfo.nights);

            const totalPrice = hotels[bookingInfo.hotelIndex].price * bookingInfo.nights * bookingInfo.rooms;

            const booking = await Booking.create({
                hotel: hotels[bookingInfo.hotelIndex]._id,
                user: users[bookingInfo.userIndex]._id,
                checkInDate: checkInDate,
                checkOutDate: checkOutDate,
                numberOfRooms: bookingInfo.rooms,
                totalPrice: totalPrice,
                status: 'confirmed',
                paymentStatus: 'completed',
                paymentIntentId: `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });
            bookings.push(booking);

            // Create payment record
            await Payment.create({
                booking: booking._id,
                user: users[bookingInfo.userIndex]._id,
                amount: totalPrice,
                paymentIntentId: booking.paymentIntentId,
                status: 'succeeded'
            });
        }
        console.log('Created 10 bookings with payments');

        // Create reviews for past bookings only
        const reviewTexts = [
            "Amazing stay! The staff was incredibly friendly and the room was spotless. Will definitely come back!",
            "Great location and excellent amenities. The pool area was fantastic and the restaurant had delicious food.",
            "Comfortable rooms and good service. The hotel exceeded my expectations in every way.",
            "Beautiful property with stunning views. Perfect for a romantic getaway or family vacation.",
            "Outstanding hospitality and attention to detail. The spa services were absolutely wonderful.",
            "Clean, modern facilities with all the amenities you could need. Highly recommend this place!",
            "Exceptional value for money. The breakfast was incredible and the staff went above and beyond.",
            "Peaceful and relaxing atmosphere. Great place to unwind and enjoy some quality time."
        ];

        let reviewIndex = 0;
        for (let i = 0; i < bookings.length; i++) {
            const booking = bookings[i];
            // Only create reviews for past bookings (negative daysFromNow)
            if (bookingData[i].daysFromNow < 0 && reviewIndex < reviewTexts.length) {
                const rating = Math.floor(Math.random() * 2) + 4; // Random rating between 4-5
                
                const review = await Review.create({
                    text: reviewTexts[reviewIndex],
                    rating: rating,
                    author: {
                        id: booking.user,
                        username: users[bookingData[i].userIndex].username
                    }
                });

                // Add review to hotel
                const hotel = hotels[bookingData[i].hotelIndex];
                hotel.reviews.push(review._id);
                
                // Recalculate average rating
                const allReviews = await Review.find({ _id: { $in: hotel.reviews } });
                const sum = allReviews.reduce((acc, rev) => acc + rev.rating, 0);
                hotel.averageRating = allReviews.length > 0 ? sum / allReviews.length : 0;
                
                await hotel.save();
                reviewIndex++;
            }
        }
        console.log('Created reviews for past bookings');

        res.json({
            success: true,
            message: 'Database seeded successfully!',
            data: {
                admins: admins.length,
                users: users.length,
                hotels: hotels.length,
                bookings: bookings.length,
                reviews: reviewIndex
            },
            credentials: {
                admins: admins.map(admin => ({ username: admin.username, password: 'password123' })),
                users: users.map(user => ({ username: user.username, password: 'password123' }))
            }
        });

    } catch (error) {
        console.error('Seeding error:', error);
        res.status(500).json({
            success: false,
            message: 'Error seeding database',
            error: error.message
        });
    }
});

// Serve default hotel image for missing images
app.get('/uploads/hotel-:id.jpg', (req, res) => {
    // Send a default hotel image or placeholder
    res.redirect('https://via.placeholder.com/400x200/0066cc/ffffff?text=Hotel+' + req.params.id);
});

// Payment success route
app.get('/payment-success', isLoggedIn, async (req, res) => {
    try {
        const bookingId = req.query.booking_id;
        if (!bookingId) {
            return res.redirect('/my-bookings');
        }

        const booking = await Booking.findById(bookingId);
        if (!booking || !booking.user.equals(req.session.userId)) {
            return res.redirect('/my-bookings');
        }

        // Update booking status to confirmed and payment status to completed
        booking.status = 'confirmed';
        booking.paymentStatus = 'completed';
        await booking.save();

        // Update payment record
        await Payment.findOneAndUpdate(
            { booking: bookingId },
            { status: 'succeeded' }
        );

        console.log('Payment confirmed for booking:', bookingId);
        res.redirect('/my-bookings?payment=success');
    } catch (error) {
        console.error('Error confirming payment:', error);
        res.redirect('/my-bookings?payment=error');
    }
});

// AUTH
app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
    const { username, password, adminCode } = req.body;
    const isAdmin = adminCode === 'secret123';
    const user = await User.create({ username, password, isAdmin });
    req.session.userId = user._id;
    res.redirect('/hotels');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
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

// HOTEL ROUTES

app.get('/hotels', async (req, res) => {
    const { minRating, maxPrice } = req.query;
    let query = {};
    if (minRating) query.averageRating = { $gte: Number(minRating) };
    if (maxPrice) query.price = { $lte: Number(maxPrice) };
    const allHotels = await Hotel.find(query);
    res.render('index', { hotels: allHotels, search: req.query });
});

// UPDATED: Added isAdmin to the "New Hotel" form route
app.get('/hotels/new', isLoggedIn, isAdmin, (req, res) => res.render('new'));

// UPDATED: Added isAdmin to the creation logic
app.post('/hotels', isLoggedIn, isAdmin, upload.single('image'), async (req, res) => {
    const user = await User.findById(req.session.userId);
    const newHotel = {
        name: req.body.name,
        image: '/uploads/' + req.file.filename,
        description: req.body.description,
        price: req.body.price,
        totalRooms: req.body.totalRooms || 10,
        amenities: req.body.amenities ? req.body.amenities.split(',').map(a => a.trim()) : [],
        author: {
            id: user._id,
            username: user.username
        }
    };
    await Hotel.create(newHotel);
    res.redirect('/hotels');
});

app.get('/hotels/:id', async (req, res) => {
    const hotel = await Hotel.findById(req.params.id).populate('reviews');
    
    let hasBooked = false;
    if (req.session.userId) {
        // Check if current user has booked this hotel
        hasBooked = await Booking.findOne({
            hotel: req.params.id,
            user: req.session.userId,
            status: 'confirmed',
            paymentStatus: 'completed'
        });
    }
    
    res.render('show', { hotel: hotel, hasBooked: !!hasBooked });
});

app.get('/hotels/:id/edit', isLoggedIn, checkHotelOwnership, async (req, res) => {
    const hotel = await Hotel.findById(req.params.id);
    res.render('edit', { hotel: hotel });
});

app.put('/hotels/:id', isLoggedIn, checkHotelOwnership, async (req, res) => {
    await Hotel.findByIdAndUpdate(req.params.id, req.body.hotel);
    res.redirect('/hotels/' + req.params.id);
});

app.delete('/hotels/:id', isLoggedIn, checkHotelOwnership, async (req, res) => {
    await Hotel.findByIdAndDelete(req.params.id);
    res.redirect('/hotels');
});

app.get('/my-hotels', isLoggedIn, async (req, res) => {
    const userHotels = await Hotel.find({ 'author.id': req.session.userId });
    res.render('my-hotels', { hotels: userHotels });
});

// REVIEW ROUTES
app.post('/hotels/:id/reviews', isLoggedIn, async (req, res) => {
    const hotel = await Hotel.findById(req.params.id).populate('reviews');
    const user = await User.findById(req.session.userId);

    if (hotel.author.id.equals(user._id)) return res.send("Cannot review own hotel");
    if (user.isAdmin) return res.send("Admins cannot add reviews");
    
    // Check if user has booked this hotel and payment is completed
    const hasBooked = await Booking.findOne({
        hotel: req.params.id,
        user: user._id,
        status: 'confirmed',
        paymentStatus: 'completed'
    });
    
    if (!hasBooked) return res.send("You can only review hotels you have booked and stayed at");
    
    const existing = hotel.reviews.find(r => r.author.id.equals(user._id));
    if (existing) return res.send("Already reviewed");

    const review = await Review.create({
        text: req.body.text,
        rating: Number(req.body.rating),
        author: { id: user._id, username: user.username }
    });

    hotel.reviews.push(review);
    await hotel.save();

    // Recalculate average
    const updatedHotel = await Hotel.findById(req.params.id).populate('reviews');
    const sum = updatedHotel.reviews.reduce((acc, next) => acc + next.rating, 0);
    updatedHotel.averageRating = updatedHotel.reviews.length > 0 ? sum / updatedHotel.reviews.length : 0;
    await updatedHotel.save();

    res.redirect('/hotels/' + hotel._id);
});

app.get('/hotels/:id/reviews/:reviewId/edit', isLoggedIn, async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (!review.author.id.equals(req.session.userId)) {
        return res.redirect('back');
    }
    res.render('reviews/edit', { review: review, hotelId: req.params.id });
});

app.put('/hotels/:id/reviews/:reviewId', isLoggedIn, async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    if (!review.author.id.equals(req.session.userId)) {
        return res.redirect('back');
    }
    
    await Review.findByIdAndUpdate(req.params.reviewId, {
        text: req.body.text,
        rating: Number(req.body.rating)
    });
    
    // Recalculate average rating
    const hotel = await Hotel.findById(req.params.id).populate('reviews');
    const sum = hotel.reviews.reduce((acc, next) => acc + next.rating, 0);
    hotel.averageRating = hotel.reviews.length > 0 ? sum / hotel.reviews.length : 0;
    await hotel.save();
    
    res.redirect('/hotels/' + req.params.id);
});

app.delete('/hotels/:id/reviews/:reviewId', isLoggedIn, async (req, res) => {
    const review = await Review.findById(req.params.reviewId);
    const currentUser = await User.findById(req.session.userId);
    
    if (!review.author.id.equals(req.session.userId) && !currentUser.isAdmin) {
        return res.redirect('back');
    }
    
    // Remove review from hotel's reviews array
    await Hotel.findByIdAndUpdate(req.params.id, {
        $pull: { reviews: req.params.reviewId }
    });
    
    // Delete the review
    await Review.findByIdAndDelete(req.params.reviewId);
    
    // Recalculate average rating
    const hotel = await Hotel.findById(req.params.id).populate('reviews');
    const sum = hotel.reviews.reduce((acc, next) => acc + next.rating, 0);
    hotel.averageRating = hotel.reviews.length > 0 ? sum / hotel.reviews.length : 0;
    await hotel.save();
    
    res.redirect('/hotels/' + req.params.id);
});

// BOOKING ROUTES
app.get('/hotels/:id/book', isLoggedIn, async (req, res) => {
    const user = await User.findById(req.session.userId);
    if (user.isAdmin) {
        return res.send("Admins cannot book hotels");
    }
    const hotel = await Hotel.findById(req.params.id);
    res.render('book', { hotel });
});

app.post('/hotels/:id/book', isLoggedIn, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (user.isAdmin) {
            return res.send("Admins cannot book hotels");
        }
        
        const { checkInDate, checkOutDate, numberOfRooms } = req.body;
        const hotel = await Hotel.findById(req.params.id);

        // Validate dates
        const checkIn = new Date(checkInDate);
        const checkOut = new Date(checkOutDate);
        const today = new Date();
        
        if (checkIn < today || checkOut <= checkIn) {
            return res.send("Invalid dates");
        }

        // Check room availability
        const existingBookings = await Booking.find({
            hotel: req.params.id,
            status: 'confirmed',
            $or: [
                { checkInDate: { $lte: checkOut }, checkOutDate: { $gte: checkIn } }
            ]
        });

        const bookedRooms = existingBookings.reduce((sum, booking) => sum + booking.numberOfRooms, 0);
        const availableRooms = hotel.totalRooms - bookedRooms;

        if (numberOfRooms > availableRooms) {
            return res.send(`Only ${availableRooms} rooms available for these dates`);
        }

        // Calculate total price
        const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
        const totalPrice = hotel.price * numberOfRooms * nights;

        // Create booking
        const booking = await Booking.create({
            hotel: req.params.id,
            user: user._id,
            checkInDate: checkIn,
            checkOutDate: checkOut,
            numberOfRooms: parseInt(numberOfRooms),
            totalPrice
        });

        res.redirect(`/bookings/${booking._id}/payment`);
    } catch (error) {
        console.error(error);
        res.send("Booking failed");
    }
});

// PAYMENT ROUTES
app.get('/bookings/:id/payment', isLoggedIn, async (req, res) => {
    const booking = await Booking.findById(req.params.id).populate('hotel user');
    if (!booking || !booking.user._id.equals(req.session.userId)) {
        return res.redirect('/hotels');
    }
    
    // Check if Stripe keys are configured
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
        
        if (!booking) {
            console.log('Booking not found');
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        if (!booking.user._id.equals(req.session.userId)) {
            console.log('Unauthorized access attempt');
            return res.status(403).json({ error: 'Unauthorized' });
        }

        console.log('Creating payment intent for amount:', booking.totalPrice);
        
        // Create Stripe payment intent
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(booking.totalPrice * 100), // Convert to cents
            currency: 'usd',
            metadata: {
                bookingId: booking._id.toString()
            }
        });

        console.log('Payment intent created:', paymentIntent.id);

        // Update booking with payment intent
        booking.paymentIntentId = paymentIntent.id;
        await booking.save();

        // Create payment record
        await Payment.create({
            booking: booking._id,
            user: booking.user._id,
            amount: booking.totalPrice,
            paymentIntentId: paymentIntent.id
        });

        console.log('Sending client secret to frontend');
        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Payment route error:', error);
        res.status(500).json({ error: 'Payment processing failed: ' + error.message });
    }
});

// Stripe webhook for payment confirmation
app.post('/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.log(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        const bookingId = paymentIntent.metadata.bookingId;

        console.log('Webhook: Payment succeeded for booking:', bookingId);

        // Update booking and payment status
        await Booking.findByIdAndUpdate(bookingId, {
            status: 'confirmed',
            paymentStatus: 'completed'
        });

        await Payment.findOneAndUpdate(
            { paymentIntentId: paymentIntent.id },
            { status: 'succeeded' }
        );

        console.log('Webhook: Booking status updated to confirmed');
    }

    res.json({received: true});
});

// USER BOOKINGS
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
        
        if (!booking || !booking.user.equals(req.session.userId)) {
            return res.redirect('/my-bookings');
        }
        
        if (booking.status === 'cancelled') {
            return res.send("Booking is already cancelled");
        }
        
        // Check if booking can be cancelled (1 week before check-in)
        const oneWeekFromNow = new Date();
        oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
        
        if (booking.checkInDate <= oneWeekFromNow) {
            return res.send("Cannot cancel booking within 1 week of check-in date");
        }
        
        // Cancel the booking
        booking.status = 'cancelled';
        await booking.save();
        
        res.redirect('/my-bookings');
    } catch (error) {
        console.error(error);
        res.send("Cancellation failed");
    }
});

// ADMIN BOOKING MANAGEMENT
app.get('/admin/bookings', isLoggedIn, isAdmin, async (req, res) => {
    const bookings = await Booking.find()
        .populate('hotel user')
        .sort({ createdAt: -1 });
    res.render('admin-bookings', { bookings });
});

// ... (Other routes like EDIT/UPDATE/DELETE remain the same using checkHotelOwnership) ...

app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));