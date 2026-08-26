import express from "express";
import { getAllRecords } from "../controllers/serviceControllers.mjs";

const router = express.Router();

router.get('/', (req, res) => { 
  res.render('index');
});

router.get('/service-records', (req, res) => {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }

  return getAllRecords(req, res);
});

//full route path is got by combining the path in app.use(..) and the path in router.get(...)
// "/"


export default router;
