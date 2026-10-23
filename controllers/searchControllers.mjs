import Customers from "../models/Customers.mjs";
import Vehicle from "../models/Vehicle.mjs";
import Stock from "../models/Stock.mjs";
import ServiceRecord from "../models/ServiceRecord.mjs";
import User from "../models/User.mjs";

export const globalSearch = async (req, res) => {
    try {
        const searchQuery = req.query.q?.trim() || "";

        // If nothing was searched
        if (!searchQuery) {
            return res.redirect("/dashboard");
        }

        // Escape special regex characters
        const escapedQuery = searchQuery.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );

        const regex = new RegExp(escapedQuery, "i");

        // --------------------------------
        // SEARCH CUSTOMERS
        // --------------------------------

        const customerConditions = [
            { firstName: regex },
            { lastName: regex },
            { email: regex }
        ];

        // Phones are stored as text (0758979048). Older records may still hold a Number,
        // so compare as text in both cases. Digits only, so "0758 979" style input still matches.
        const phoneDigits = searchQuery.replace(/\D/g, '');
        if (phoneDigits) {
            customerConditions.push({
                $expr: {
                    $regexMatch: {
                        input: { $toString: { $ifNull: ['$phone', ''] } },
                        regex: phoneDigits.replace(/^0/, '')
                    }
                }
            });
        }

        const customers = await Customers.find({
            $or: customerConditions
        }).limit(20);


        // --------------------------------
        // SEARCH VEHICLES
        // --------------------------------

        const vehicles = await Vehicle.find({
            $or: [
                { registrationNo: regex },
                { vehicleName: regex },
                { vehicleType: regex }
            ]
        }).limit(20);


        // --------------------------------
        // SEARCH STOCK
        // --------------------------------

        const stockItems = await Stock.find({
            itemName: regex
        }).limit(20);


        // --------------------------------
        // SEARCH TECHNICIANS / USERS
        // --------------------------------

        const technicians = await User.find({
            fullName: regex,
            role: { $in: ["Technician", "Senior technician"] }
        }).limit(20);


        // --------------------------------
        // GET IDs
        // --------------------------------

        const customerIds = customers.map(
            customer => customer._id
        );

        const vehicleIds = vehicles.map(
            vehicle => vehicle._id
        );

        const technicianIds = technicians.map(
            technician => technician._id
        );


        // --------------------------------
        // SEARCH SERVICE RECORDS
        // --------------------------------

        const serviceRecords = await ServiceRecord.find({
            $or: [
                { customer: { $in: customerIds } },
                { vehicle: { $in: vehicleIds } },
                { technicians: { $in: technicianIds } },
                { servicesDone: regex }
            ]
        })
            .populate(
                "customer",
                "firstName lastName phone email"
            )
            .populate(
                "vehicle",
                "registrationNo vehicleName vehicleType"
            )
            .populate(
                "technicians",
                "fullName"
            )
            .sort({ date: -1 })
            .limit(20);


        // --------------------------------
        // DISPLAY SEARCH RESULTS
        // --------------------------------

        return res.render("search-results", {
            searchQuery,
            customers,
            vehicles,
            stockItems,
            serviceRecords,
            technicians,
            user: req.session?.user
        });


    } catch (error) {

        console.error("Global search error:", error);

        return res
            .status(500)
            .send("Error performing search");
    }
};