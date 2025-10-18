import express from "express";
import dotenv from "dotenv";
import uploadRoutes from "./routes/upload.js";
import productRoutes from "./routes/products.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.use("/upload", uploadRoutes);
app.use("/products", productRoutes);

app.get("/", (req, res) => {
  res.send("Product Catalog API is running!");
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
