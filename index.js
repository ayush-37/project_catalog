import express from "express";
import pg from "pg";
import multer from "multer";
import csv from "csv-parser";
import { Readable } from "stream";
import format from "pg-format";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage() });

// PostgreSQL connection pool
const { Pool } = pg;
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

// Testing DB connection
try {
  const res = await pool.query("SELECT NOW()");
  console.log("Connection: Success", res.rows[0].now);
} catch (err) {
  console.error("Connection: Fail", err.stack);
}

app.get("/", (req, res) => {
  res.send("Product Catalog API is running!");
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const validProducts = [];
  const invalidProducts = [];

  const bufferStream = new Readable();
  bufferStream.push(req.file.buffer);
  bufferStream.push(null);

  bufferStream
    .pipe(csv())
    .on("data", (row) => {
      const { sku, name, brand, mrp, price, quantity } = row;
      let isValid = true;
      let errors = [];

      //Required fields
      if (!sku || !name || !brand || !mrp || !price) {
        isValid = false;
        errors.push("Missing required fields (sku, name, brand, mrp, price)");
      }

      const numMrp = parseFloat(mrp);
      const numPrice = parseFloat(price);
      const numQuantity = parseInt(quantity, 10);

      if (isNaN(numMrp) || isNaN(numPrice)) {
        isValid = false;
        errors.push("mrp or price is not a valid number");
      }

      //  price <= mrp
      if (isValid && numPrice > numMrp) {
        isValid = false;
        errors.push("Price cannot be greater than MRP");
      }

      //  quantity >= 0
      if (isNaN(numQuantity) || numQuantity < 0) {
        isValid = false;
        errors.push("Quantity must be a non-negative integer");
      }

      if (isValid) {
        validProducts.push([
          sku,
          name,
          brand,
          row.color || null,
          row.size || null,
          numMrp,
          numPrice,
          numQuantity,
        ]);
      } else {
        invalidProducts.push({ sku: sku || "UNKNOWN", errors: errors });
      }
    })
    .on("end", async () => {
      if (validProducts.length === 0) {
        return res.status(200).json({
          message: "File processed, but no valid products found to store.",
          stored: 0,
          failed: invalidProducts.length,
          errors: invalidProducts,
        });
      }

      const query = format(
        "INSERT INTO products (sku, name, brand, color, size, mrp, price, quantity) VALUES %L ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, brand = EXCLUDED.brand, color = EXCLUDED.color, size = EXCLUDED.size, mrp = EXCLUDED.mrp, price = EXCLUDED.price, quantity = EXCLUDED.quantity",
        validProducts
      );

      try {
        await pool.query(query);
        res.status(200).json({
          message: "File processed successfully",
          stored: validProducts.length, 
          failed: invalidProducts.length,
          errors: invalidProducts,
        });
      } catch (dbError) {
        console.error("Database insert error:", dbError);
        res
          .status(500)
          .json({
            error: "Failed to store data in database.",
            details: dbError.message,
          });
      }
    })
    .on("error", (error) => {
      console.error("CSV parsing error:", error);
      res.status(500).json({ error: "Error processing CSV file." });
    });
});

app.get("/products", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  try {
    const productsQuery =
      "SELECT * FROM products ORDER BY sku LIMIT $1 OFFSET $2";
    const { rows } = await pool.query(productsQuery, [limit, offset]);

    const countQuery = "SELECT COUNT(*) FROM products";
    const totalResult = await pool.query(countQuery);
    const totalProducts = parseInt(totalResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({
      totalProducts,
      totalPages,
      currentPage: page,
      limit,
      products: rows,
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/products/search", async (req, res) => {
  const { brand, color, minPrice, maxPrice } = req.query;

  let queryBase = "SELECT * FROM products WHERE 1=1";
  const queryParams = [];
  let paramIndex = 1;

  if (brand) {
    queryBase += ` AND brand = $${paramIndex++}`;
    queryParams.push(brand);
  }
  if (color) {
    queryBase += ` AND color = $${paramIndex++}`;
    queryParams.push(color);
  }
  if (minPrice) {
    queryBase += ` AND price >= $${paramIndex++}`;
    queryParams.push(parseFloat(minPrice));
  }
  if (maxPrice) {
    queryBase += ` AND price <= $${paramIndex++}`;
    queryParams.push(parseFloat(maxPrice));
  }

  try {
    const { rows } = await pool.query(queryBase, queryParams);
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No products match your criteria." });
    }
    res.status(200).json(rows); 
  } catch (err) {
    console.error("Error searching products:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
