import { pool } from "../db.js";

export const getProducts = async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM products ORDER BY sku LIMIT $1 OFFSET $2",
      [limit, offset]
    );

    const totalResult = await pool.query("SELECT COUNT(*) FROM products");
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
};

export const searchProducts = async (req, res) => {
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
};
