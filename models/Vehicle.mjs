import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customers',
      default: null,
      index: true,
    },
    vehicleName: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: '',
      trim: true,
    },
    registrationNo: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleType: {
      type: String,
      enum: ['small', 'commercial', 'heavy'],
      required: true,
    },
    lastService: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['Active', 'Service Due'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

const Vehicle = mongoose.models.Vehicle || mongoose.model('Vehicle', vehicleSchema);

export default Vehicle;
