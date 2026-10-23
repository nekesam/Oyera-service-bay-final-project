import mongoose from 'mongoose';

const serviceRecordSchema = new mongoose.Schema({

    customer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customers',
        required: true
    },

    vehicle: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vehicle',
        required: true
    },

    servicesDone: [{
        type: String,
        required: true
    }],

    partsUsed: [{
        stockId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Stock'
        },
        itemName: {
            type: String
        },
        quantity: {
            type: Number
        },
        // price of ONE unit at the time of the job (later price changes do not rewrite history)
        unitPrice: {
            type: Number
        }
    }],

    // Itemised bill: labour, charged services and parts, each with its price at the time.
    // Older records created before this field existed simply have an empty list.
    lineItems: [{
        type: { type: String, enum: ['labour', 'service', 'part'], required: true },
        description: { type: String, required: true },
        stockId: { type: mongoose.Schema.Types.ObjectId, ref: 'Stock' },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        amount: { type: Number, required: true }
    }],

    technicians: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],

    labourCharge: {
        type: Number,
        default: 20000
    },

    totalCost: {
        type: Number,
        required: true
    },

    date: {
        type: Date,
        default: Date.now
    },

    // Where the job is: Booked / In progress / Ready for pickup / Collected.
    // No default on purpose: records saved before this field existed are treated as Collected.
    status: {
        type: String,
        enum: ['Booked', 'In progress', 'Ready for pickup', 'Collected']
    },

    // Money received for this job. Paid / part paid / unpaid is worked out from this list.
    payments: [{
        amount: { type: Number, required: true, min: 1 },
        method: { type: String, enum: ['Cash', 'Mobile money', 'Card', 'Bank transfer'], required: true },
        note: { type: String, trim: true },
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        date: { type: Date, default: Date.now }
    }]

});

// Speeds up the records list, dashboard, reports and the customer/vehicle history pages
serviceRecordSchema.index({ date: -1 });
serviceRecordSchema.index({ status: 1 });
serviceRecordSchema.index({ customer: 1, date: -1 });
serviceRecordSchema.index({ vehicle: 1, date: -1 });
serviceRecordSchema.index({ technicians: 1, date: -1 });

const ServiceRecord =
    mongoose.models.ServiceRecord ||
    mongoose.model('ServiceRecord', serviceRecordSchema);

export default ServiceRecord;