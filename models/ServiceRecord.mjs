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
        }
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
    }

});

const ServiceRecord =
    mongoose.models.ServiceRecord ||
    mongoose.model('ServiceRecord', serviceRecordSchema);

export default ServiceRecord;