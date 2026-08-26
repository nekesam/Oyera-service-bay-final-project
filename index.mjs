import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import MongoStore from "connect-mongo";

import connectDB from "./db.mjs";//importing DB connection function

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//1.Dependencies
import 'dotenv/config';


//importing routes
import registerStockRoutes from "./routes/registerStockRoutes.mjs";
import authRoutes from "./routes/authRoutes.mjs";
import customerRoutes from "./routes/customerRoutes.mjs";
import indexRoutes from "./routes/indexRoutes.mjs";
import dashboardRoutes from "./routes/dashboardRoutes.mjs";
import vehicleRoutes from "./routes/vehicleRoutes.mjs";
import serviceRoutes from "./routes/serviceRoutes.mjs";
import technicianRoutes from "./routes/technicianRoutes.mjs";
import reportsRoutes from "./routes/reportsRoutes.js";


//2.Instantiations
const app = express();

//3.Configurations
//database configurations
connectDB(); //connect to the database


//set view engine to pug
app.set("view engine", "pug");//specify the view engine
app.set("views", path.join(__dirname, "views")); //specify the views directory

//4.Middleware
//Middleware to parse form data
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({extended:true}))
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
       mongoUrl: process.env.DATABASE,
       collectionname: 'sessions'
    }),
    
    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 1000 * 60 * 60 * 2
    }
}));

//Making a logged in user name and role available to all pug templates
app.use((req, res, next) =>{
    res.locals.user = req.session?.userId ? {fullName : req.session.userName, role : req.session.userRole} : null
    next();
})

//Use imported Routes
app.use("/registerStock", registerStockRoutes);
app.use("/", authRoutes);
app.use("/customers", customerRoutes); // customer registration + customer records routes
app.use("/", dashboardRoutes);
app.use("/", indexRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/", serviceRoutes);
app.use("/", technicianRoutes);
app.use("/", reportsRoutes);



//Handling non-existent routes
//Should always be the last route callback
app.use((req, res) => {
res.status(404).send('Oops! Route not found.');
});

//6.Bootstrapping Server
//Always the last line in this file
app.listen(3000, () => console.log('listening on port 3000')); // new