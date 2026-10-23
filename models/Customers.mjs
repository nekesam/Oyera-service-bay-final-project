import mongoose from 'mongoose';
const customerSchema = mongoose.Schema({
  customerId:{
    type:String
  },
    firstName:{
        type:String
    },
    lastName:{
        type:String
    },
    // Stored as text in the form 0758979048 (see utils/phone.mjs). A Number lost the leading 0.
    phone:{
        type:String,
        trim:true
    },
    email:{
        type:String
    },
    address:{
        type:String
    }
}, { timestamps: true });

customerSchema.index({ lastName: 1, firstName: 1 });
customerSchema.index({ phone: 1 });

const Customers = mongoose.models.Customers || mongoose.model('Customers', customerSchema);

export default Customers;