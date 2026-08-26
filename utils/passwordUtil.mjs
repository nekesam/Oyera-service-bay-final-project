import bcrypt from "bcryptjs";

export const hashPasswordHook = async function() {
 //if password isn't modified just return to let mongoose continue
    if(!this.isModified('password')) return;

    //hash the password
    this.password = await bcrypt.hash(this.password, 10)
}