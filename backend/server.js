const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: 'https://chicken-mutton-shop.vercel.app/',
  methods: ['GET', 'POST'],
  credentials: true,
}));
app.use(express.json());

// Initialize Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error('Nodemailer configuration error:', error);
  } else {
    console.log('Nodemailer configuration successful, ready to send emails');
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((error) => {
  console.error('Error connecting to MongoDB:', error.message);
});

// Define Order Schema
const orderSchema = new mongoose.Schema({
  cartItems: [
    {
      id: String,
      name: String,
      price: Number,
      quantity: Number,
      image: String,
      category: String,
    },
  ],
  deliveryAddress: String,
  mobileNumber: String,
  altMobileNumber: String,
  paymentMethod: String,
  totalPrice: Number,
  status: {
    type: String,
    enum: ['Pending', 'Accepted', 'Rejected', 'Delivered'],
    default: 'Pending',
  },
  deliveredAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model('Order', orderSchema);

// Define Referral Schema
const referralSchema = new mongoose.Schema({
  referrerId: String, // Should be the ID of the user who sent the referral
  referralCode: String,
  referredEmail: String,
  status: {
    type: String,
    enum: ['Pending', 'Completed'],
    default: 'Pending',
  },
  reward: {
    type: String,
    default: '₹100 Discount',
  },
  discountCode: String,
  claimed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Referral = mongoose.model('Referral', referralSchema);

// Endpoint to place an order
app.post('/api/orders', async (req, res) => {
  try {
    console.log('Received order request:', req.body);

    const { cartItems, deliveryAddress, mobileNumber, altMobileNumber, paymentMethod, totalPrice, referralCode } = req.body;

    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart items are required' });
    }
    if (!deliveryAddress || typeof deliveryAddress !== 'string') {
      return res.status(400).json({ success: false, error: 'Delivery address is required' });
    }
    if (!mobileNumber || !/^[0-9]{10}$/.test(mobileNumber)) {
      return res.status(400).json({ success: false, error: 'Valid mobile number is required' });
    }
    if (!paymentMethod || paymentMethod !== 'cod') {
      return res.status(400).json({ success: false, error: 'Payment method must be COD' });
    }
    if (typeof totalPrice !== 'number' || totalPrice <= 0) {
      return res.status(400).json({ success: false, error: 'Valid total price is required' });
    }

    const cleanedCartItems = cartItems.map(item => ({
      id: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity),
      image: item.image,
      category: item.category,
    }));

    const order = new Order({
      cartItems: cleanedCartItems,
      deliveryAddress,
      mobileNumber,
      altMobileNumber,
      paymentMethod,
      totalPrice,
      status: 'Pending',
    });
    await order.save();

    // If a referral code is provided, mark the referral as completed
    if (referralCode) {
      const referral = await Referral.findOne({ referralCode });
      if (referral && referral.status === 'Pending') {
        referral.status = 'Completed';
        referral.discountCode = `DISCOUNT${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        await referral.save();
      }
    }

    const itemsList = cartItems.map(item => `<li>${item.name} (Qty: ${item.quantity}) - ₹${item.price * item.quantity}</li>`).join('');
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Order Received - Abdul's Chicken</h2>
        <p><strong>Order ID:</strong> ${order._id}</p>
        <p><strong>Items:</strong></p>
        <ul>${itemsList}</ul>
        <p><strong>Total:</strong> ₹${totalPrice}</p>
        <p><strong>Delivery Address:</strong> ${deliveryAddress}</p>
        <p><strong>Mobile:</strong> ${mobileNumber}</p>
        <p><strong>Alt Mobile:</strong> ${altMobileNumber || 'N/A'}</p>
        <p style="color: #777; font-size: 14px; margin-top: 20px;">
          Please visit the <a href="http://localhost:3000/owner-dashboard" style="color: #d32f2f; text-decoration: none;">Owner Dashboard</a> to accept or reject this order.
        </p>
      </div>
    `;

    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.OWNER_EMAIL,
        subject: `New Order Received - Order ID: ${order._id}`,
        html: emailBody,
      };
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Failed to send email:', emailError.message);
    }

    res.json({ success: true, message: 'Order placed successfully', orderId: order._id });
  } catch (error) {
    console.error('Error processing order:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to fetch pending orders
app.get('/api/orders/pending', async (req, res) => {
  try {
    const orders = await Order.find({ status: 'Pending' });
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching pending orders:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to fetch all orders
app.get('/api/orders/all', async (req, res) => {
  try {
    const orders = await Order.find();
    res.json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching all orders:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to accept an order
app.post('/api/orders/:orderId/accept', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status !== 'Pending') {
      return res.status(400).json({ success: false, error: 'Order cannot be accepted' });
    }

    order.status = 'Accepted';
    await order.save();

    res.json({ success: true, message: 'Order accepted successfully' });
  } catch (error) {
    console.error('Error accepting order:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to reject an order
app.post('/api/orders/:orderId/reject', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status !== 'Pending') {
      return res.status(400).json({ success: false, error: 'Order cannot be rejected' });
    }

    order.status = 'Rejected';
    await order.save();

    res.json({ success: true, message: 'Order rejected successfully' });
  } catch (error) {
    console.error('Error rejecting order:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to mark an order as delivered
app.post('/api/orders/:orderId/deliver', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    if (order.status !== 'Accepted') {
      return res.status(400).json({ success: false, error: 'Order must be accepted before marking as delivered' });
    }

    order.status = 'Delivered';
    order.deliveredAt = new Date();
    await order.save();

    res.json({ success: true, message: 'Order marked as delivered successfully' });
  } catch (error) {
    console.error('Error marking order as delivered:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to send referral email
app.post('/api/referrals/send', async (req, res) => {
  try {
    const { friendEmail, referralLink } = req.body;

    if (!friendEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friendEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    // Extract referral code from the link
    const url = new URL(referralLink);
    const referralCode = url.searchParams.get('ref');

    // Save the referral to the database
    const referral = new Referral({
      referrerId: 'mockUser123', // Replace with actual user ID from auth
      referralCode,
      referredEmail: friendEmail,
    });
    await referral.save();

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You've Been Invited to Abdul's Chicken!</h2>
        <p>A friend has invited you to join Abdul's Chicken, where you can enjoy delicious chicken and mutton products.</p>
        <p>Use the link below to sign up and get a ₹100 discount on your first order:</p>
        <p><a href="${referralLink}" style="color: #d32f2f; text-decoration: none;">${referralLink}</a></p>
        <p>We can't wait to have you on board!</p>
        <p style="color: #777; font-size: 14px; margin-top: 20px;">
          Abdul's Chicken Team
        </p>
      </div>
    `;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: friendEmail,
      subject: 'You’re Invited to Abdul’s Chicken – Get ₹100 Off!',
      html: emailBody,
    };

    await transporter.sendMail(mailOptions);
    console.log('Referral email sent successfully to:', friendEmail);

    res.json({ success: true, message: 'Referral email sent successfully' });
  } catch (error) {
    console.error('Error sending referral email:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to fetch rewards
app.get('/api/rewards', async (req, res) => {
  try {
    // In a real app, filter by referrerId (user ID)
    const rewards = await Referral.find();
    res.json({ success: true, rewards });
  } catch (error) {
    console.error('Error fetching rewards:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to claim a reward
app.post('/api/rewards/claim/:rewardId', async (req, res) => {
  try {
    const { rewardId } = req.params;
    const referral = await Referral.findById(rewardId);

    if (!referral) {
      return res.status(404).json({ success: false, error: 'Referral not found' });
    }

    if (referral.status !== 'Completed') {
      return res.status(400).json({ success: false, error: 'Reward cannot be claimed yet' });
    }

    if (referral.claimed) {
      return res.status(400).json({ success: false, error: 'Reward already claimed' });
    }

    referral.claimed = true;
    referral.discountCode = `DISCOUNT${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    await referral.save();

    res.json({ success: true, message: 'Reward claimed successfully', discountCode: referral.discountCode });
  } catch (error) {
    console.error('Error claiming reward:', error.message, error.stack);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.listen(5001, () => {
  console.log('Backend server running on http://localhost:5001');
});
