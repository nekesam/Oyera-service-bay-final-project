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
    phone:{
        type:Number
    },
    email:{
        type:String
    },
    address:{
        type:String
    }
});

const Customers = mongoose.models.Customers || mongoose.model('Customers', customerSchema);

export default Customers;