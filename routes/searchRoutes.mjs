import express from "express";

import { isAuthenticated } from "../middleware/auth.mjs";

import {
    globalSearch
} from "../controllers/searchControllers.mjs";

const router = express.Router();

router.get("/search",isAuthenticated,globalSearch);

export default router;