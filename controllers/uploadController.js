import csv from "csv-parser";
import { Readable } from "stream";
import format from "pg-format";
import { pool } from "../db.js";

export const uploadProducts = (req, res) => {
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
      const errors = [];

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

      if (isValid && numPrice > numMrp) {
        isValid = false;
        errors.push("Price cannot be greater than MRP");
      }

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
        invalidProducts.push({ sku: sku || "UNKNOWN", errors });
      }
    })
    .on("end", async () => {
      if (validProducts.length === 0) {
        return res.status(200).json({
          message: "File processed, but no valid products found.",
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
        res.status(500).json({
          error: "Failed to store data in database.",
          details: dbError.message,
        });
      }
    })
    .on("error", (error) => {
      console.error("CSV parsing error:", error);
      res.status(500).json({ error: "Error processing CSV file." });
    });
};
