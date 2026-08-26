import mongoose from 'mongoose';
import { hashPasswordHook } from '../utils/passwordUtil.mjs';

const userSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            sparse: true,
            unique: true,
            trim: true,
        },
        phone: {
            type: String,
            sparse: true,
            unique: true,
            trim: true,
        },
        role: {
            type: String,
            enum: ['Admin', 'Senior technician', 'Technician'],
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
    },
    { timestamps: true }
);

//attach the external hashing fuction to the presave hook
userSchema.pre('save', hashPasswordHook)

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;