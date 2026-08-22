require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

const allowedOrigins = [
  'http://localhost:1420', 
  'http://localhost:5173', 
  'tauri://localhost', 
  'https://tauri.localhost'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined in .env");
  process.exit(1);
}

// Serverless Connection Caching
let cachedDb = null;

async function dbConnect() {
  if (cachedDb) return cachedDb;
  const db = await mongoose.connect(MONGODB_URI);
  cachedDb = db;
  return db;
}

// Models
const CustomerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  address: String,
  gstin: String,
  phone: String,
  createdAt: Number,
  updatedAt: Number
}, { strict: false });

const ItemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  hsn: String,
  rate: Number,
  createdAt: Number,
  updatedAt: Number
}, { strict: false });

const BillSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  invoiceNumber: String,
  date: Number,
  customerId: String,
  customerName: String,
  customerPhone: String,
  customerVillage: String,
  taxableAmount: Number,
  cgst: Number,
  sgst: Number,
  grandTotal: Number,
  status: String,
  items: Array // we'll nest bill_items here for simplicity in MongoDB
}, { strict: false });

const Customer = mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
const Item = mongoose.models.Item || mongoose.model('Item', ItemSchema);
const Bill = mongoose.models.Bill || mongoose.model('Bill', BillSchema);

// Health Endpoint
app.get('/api/health', async (req, res) => {
  try {
    await dbConnect();
    res.status(200).json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Sync Routes (Idempotent Upsert)
app.post('/api/sync/customer', async (req, res) => {
  try {
    await dbConnect();
    const data = req.body;
    await Customer.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true });
    res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/item', async (req, res) => {
  try {
    await dbConnect();
    const data = req.body;
    await Item.findOneAndUpdate({ id: data.id }, data, { upsert: true, new: true });
    res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync/bill', async (req, res) => {
  try {
    await dbConnect();
    const data = req.body;
    // Desktop sends { bill: { ... }, items: [ ... ] }
    const billDocument = {
      ...data.bill,
      items: data.items
    };
    await Bill.findOneAndUpdate({ id: billDocument.id }, billDocument, { upsert: true, new: true });
    res.status(200).json({ success: true, id: billDocument.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Sync Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
