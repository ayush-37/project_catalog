import express from "express";
import { uploadProducts } from "../controllers/uploadController.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = express.Router();

router.post("/", upload.single("file"), uploadProducts);

export default router;
