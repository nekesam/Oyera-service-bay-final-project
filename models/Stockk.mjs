import mongoose from 'mongoode';

const stockSchema = new mongoose.Schema({
    itemName: {
       type: String,
       required: true
    },
    category: {
       type: String,
       enum: ["Filters", "Engine Oil","Gearbox Oil","Brake Fluid","Other" ],
       required: true
    },
    price: {
       type: Number,
       required: true
    },
    quantity: {
       type: Number,
       required: true,
       default: 0
    },
     registeredBy:{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' 
      },
      dateAdded: {
        type: Date,
        default: Date.now 
      }
});

const Stock = mongoose.model('Stock', stockSchema );
export default Stock;