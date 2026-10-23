import mongoose from 'mongoose';

const stockSchema = new mongoose.Schema({
  stockId: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    trim: true
  },
  supplier: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    min: 0
  },
  unit: {
    type: String,
    trim: true
  },
  unitPrice: {
    type: Number,
    min: 0
  },
  date: {
    type: Date
  },
  storageLocation: {
    type: String,
    trim: true
  },
  registeredBy:{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' 
  },
  // Optional. When quantity falls to this number or below, the item shows as "low stock".
  // Items without one use LOW_STOCK_THRESHOLD from config/business.mjs.
  reorderLevel: {
    type: Number,
    min: 0
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

stockSchema.index({ category: 1 });
stockSchema.index({ itemName: 1 });

const Stock = mongoose.models.Stock || mongoose.model('Stock', stockSchema);

export default Stock;
