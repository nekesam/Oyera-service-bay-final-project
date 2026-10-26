import mongoose from 'mongoose';
import { config } from './config/index.mjs';

const connectDB = async (url = config.databaseUrl) => {
  await mongoose.connect(url);
  console.log('Connected to MongoDB successfully.');
};

export default connectDB;
