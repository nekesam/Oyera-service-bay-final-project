import mongoose from 'mongoose';
const serviceRecordSchema = new mongoose.Schema({
    customerName: {
        type: String,
        required: true
    },
    carPlate: {
        type: String,
        required: true
    },
    servicesDone: [{
        type: String,
        required: true
    }],
     partsUsed: [{
          stockId: {type: mongoose.Schema.Types.ObjectId, ref: 'Stock'},
        itemName: {type: String},
        quantity: {type: Number}
    }],
    technicians: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    labourCharge:{
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
})

const serviceRecord = mongoose.model('ServiceRecord', serviceRecordSchema);
export default serviceRecord;