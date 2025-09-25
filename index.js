const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2/promise');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const vnNow = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
const app = express();
const PORT = 3000;
const { sendMail } = require('./helpers/sendmail');
const axios = require('axios');
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ========================
// Kết nối MySQL (Pool)
// ========================
const db = mysql.createPool({
    host: 'localhost',
    user: 'user',
    password: 'pass123',
    database: 'products_db',
});

(async () => {
    try {
        const conn = await db.getConnection();
        console.log('✅ MySQL connected!');
        conn.release();
    } catch (err) {
        console.error('❌ Database connection failed:', err);
    }
})();

// ========================
// Hàm format DATETIME cho MySQL
// ========================
const formatDateTime = (date) => {
    const d = new Date(date);
    const pad = (n) => (n < 10 ? '0' + n : n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// ========================
// 1. PRODUCTS API
// ========================
app.get('/products', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM products');
        res.json(results);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.get('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [results] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
        res.json(results[0] || {});
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post('/products', async (req, res) => {
  const { name, barcode, price, category, image, quantity } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO products (name, barcode, price, category, image, quantity) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, barcode, price, category, image, quantity]
    );

    res.json({ 
      id: result.insertId, 
      name, 
      barcode, 
      price, 
      category, 
      image, 
      quantity 
    });
  } catch (err) {
    console.error("❌ Lỗi SQL khi thêm sản phẩm:", err);  // log chi tiết lỗi MySQL
    res.status(500).json({ error: "Lỗi khi thêm sản phẩm", details: err.message });
  }
});


app.put('/products/:id', async (req, res) => {
    const { id } = req.params;
    const { name, barcode, price, category, image, quantity } = req.body;
    try {
        await db.query(
            'UPDATE products SET name=?, barcode=?, price=?, category=?, image=?, quantity=? WHERE id=?',
            [name, barcode, price, category, image, quantity, id]
        );
        res.json({ id, ...req.body });
    } catch (err) {
        res.status(500).json(err);
    }
});

app.delete('/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM products WHERE id=?', [id]);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json(err);
    }
});







// ========================
// 2. USERS API
// ========================
app.get('/users', async (req, res) => {
    try {
        const [results] = await db.query('SELECT id_user, username, sdt, role FROM users');
        res.json(results);
    } catch (err) {
        res.status(500).json(err);
    }
});
// POST /users - tạo user mới
app.post('/users', async (req, res) => {
    const { username, password, sdt, role } = req.body;

    // Kiểm tra dữ liệu bắt buộc
    if (!username || !password) {
        return res.status(400).json({ error: "Thiếu thông tin bắt buộc: username, password" });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO users (username, password, sdt, role) VALUES (?, ?, ?, ?)',
            [username, password, sdt || "", role || "cashier"]
        );

        res.status(201).json({
            id_user: result.insertId,
            username,
            password, // nếu muốn bảo mật, có thể không trả về
            sdt: sdt || "",
            role: role || "cashier"
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi server", details: err.message });
    }
});


app.get('/users/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [results] = await db.query('SELECT * FROM users WHERE id_user = ?', [id]);
        if (results.length === 0) return res.status(404).json({ error: "Không tìm thấy user" });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json(err);
    }
});
// PUT /users/:id - cập nhật thông tin user
app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, sdt, role } = req.body;

    try {
        // Kiểm tra xem user có tồn tại
        const [existing] = await db.query('SELECT * FROM users WHERE id_user = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ error: "Không tìm thấy user" });

        // Cập nhật user
        await db.query(
            'UPDATE users SET username = ?, password = ?, sdt = ?, role = ? WHERE id_user = ?',
            [
                username || existing[0].username,
                password || existing[0].password,
                sdt || existing[0].sdt,
                role || existing[0].role,
                id
            ]
        );

        res.json({ message: "Cập nhật user thành công" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Lỗi server", details: err.message });
    }
});
// DELETE /users/:id - xóa user
app.delete('/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [existing] = await db.query('SELECT * FROM users WHERE id_user = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: "Không tìm thấy user" });

    await db.query('DELETE FROM users WHERE id_user = ?', [id]);
    res.json({ message: `Xóa user ${existing[0].username} thành công` });
  } catch (err) {
    console.error(err);

    // Kiểm tra lỗi ràng buộc foreign key
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(400).json({ 
        error: `USER ${existing[0].username} đang có ràng buộc về đơn hàng`
      });
    }

    res.status(500).json({ error: "Lỗi server", details: err.message });
  }
});



app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin' });

    try {
        const [results] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (results.length === 0) return res.status(401).json({ message: 'Tài khoản không tồn tại' });

        const user = results[0];
        if (password !== user.password) return res.status(401).json({ message: 'Sai mật khẩu' });

        res.json({
            message: 'Đăng nhập thành công',
            user: { id_user: user.id_user, username: user.username, role: user.role, sdt: user.sdt },
            token: 'fake-jwt-token'
        });
    } catch (err) {
        res.status(500).json(err);
    }
});

// ========================
// 3. CUSTOMERS API
// ========================
app.get('/customers', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM customers');
        res.json(results);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post('/customers', async (req, res) => {
    const { name, phone, points, address, gender, email } = req.body;

    try {
        // Loại bỏ số 0 đầu tiên (nếu có)
        const id_cus = phone.startsWith('0') ? phone.substring(1) : phone;

        // Thực hiện insert với id_cus là số điện thoại bỏ số 0
        const [result] = await db.query(
            'INSERT INTO customers (id_cus, name, phone, points, address, gender, email) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id_cus, name, phone, points || 0, address, gender, email]
        );

        res.json({ id_cus, name, phone, address, gender, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Lỗi khi tạo khách hàng mới' });
    }
});

app.get('/customers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [results] = await db.query('SELECT * FROM customers WHERE id_cus = ?', [id]);
        if (results.length === 0) return res.status(404).json({ message: 'Customer not found' });
        res.json(results[0]);
    } catch (err) {
        res.status(500).json(err);
    }
});
// Xóa tài khoản theo id_cus
app.delete('/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query('DELETE FROM customers WHERE id_cus = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({ message: `Customer ${id} deleted successfully` });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi xóa tài khoản', details: err.message });
  }
});
// Cập nhật tài khoản theo id_cus
app.put('/customers/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, address, gender, email, points } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE customers 
       SET name = ?, phone = ?, address = ?, gender = ?, email = ?, points = ?
       WHERE id_cus = ?`,
      [name, phone, address, gender, email, points || 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    res.json({
      message: 'Customer updated successfully',
      id_cus: id,
      name,
      phone,
      address,
      gender,
      email,
      points
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi khi cập nhật tài khoản', details: err.message });
  }
});


// ========================
// 4. ORDERS + ORDER_ITEMS
// ========================
  
  app.post('/orders', async (req, res) => {
  const { id_user, id_cus, created_at, tongtien, items, shift_id, used_points, payment_method } = req.body;

  if (!id_user || !tongtien || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Thiếu dữ liệu bắt buộc (id_user, tongtien, items)' });
  }
  if (!shift_id) {
    return res.status(400).json({ error: 'Thiếu shift_id (ca làm việc hiện tại)' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const orderDate = created_at ? formatDateTime(created_at) : formatDateTime(new Date());

    // Tạo order_code
    const orderCode = `DH${Date.now()}${id_user}`;

    // Tạo order
    const [orderResult] = await conn.execute(
      `INSERT INTO orders 
      (id_user, id_cus, created_at, tongtien, shift_id, used_points, order_code) 
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id_user, id_cus || null, orderDate, tongtien, shift_id, used_points || 0, orderCode]
    );
    const id_order = orderResult.insertId;

    // Xử lý sản phẩm
    for (const item of items) {
      if (!item.id_product || !item.quantity || item.quantity <= 0) {
        await conn.rollback();
        return res.status(400).json({ error: `Sản phẩm không hợp lệ: ${item.name || 'unknown'}` });
      }
      const [stockRows] = await conn.execute('SELECT quantity FROM products WHERE id = ?', [item.id_product]);
      if (stockRows.length === 0) {
        await conn.rollback();
        return res.status(400).json({ error: `Sản phẩm ${item.name} không tồn tại` });
      }
      const currentStock = stockRows[0].quantity;
      if (currentStock < item.quantity) {
        await conn.rollback();
        return res.status(400).json({ error: `Sản phẩm ${item.name} không đủ hàng (còn ${currentStock})` });
      }

      // Insert order item
      await conn.execute(
        'INSERT INTO order_items (id_order, name, barcode, price, category, image, quantity) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id_order, item.name, item.barcode || '', item.price, item.category || '', item.image || '', item.quantity]
      );

      // Trừ tồn kho
      await conn.execute('UPDATE products SET quantity = quantity - ? WHERE id = ?', [item.quantity, item.id_product]);
    }

    // Cập nhật điểm khách hàng
    let pointsEarned = 0;
    if (id_cus) {
      if (used_points && used_points > 0) {
        await conn.execute('UPDATE customers SET points = points - ? WHERE id_cus = ?', [used_points, id_cus]);
      } else {
        pointsEarned = Math.floor(tongtien * 0.03);
        await conn.execute('UPDATE customers SET points = points + ? WHERE id_cus = ?', [pointsEarned, id_cus]);
      }
    }

    await conn.commit();
    
    // if(payment_method === 'cash' && selectMail === 'yes' ) {
    //   // Gọi API gửi email
    // try {
    //   await axios.post(`http://localhost:3000/send-invoice/${orderCode}`);
    // } catch (mailErr) {
    //   console.error("❌ Lỗi khi gọi send-invoice:", mailErr.message);cnhnh
    // }

    // }
    
    // Trả kết quả cho frontend
    res.status(201).json({
      message: 'Đơn hàng tạo thành công',
      id_order,
      order_code: orderCode,
      shift_id,
      points: pointsEarned
    });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Lỗi server', details: err.message });
  } finally {
    conn.release();
  }
});





  app.get('/orders', async (req, res) => {
      try {
          const [rows] = await db.execute('SELECT * FROM orders ORDER BY id_order DESC');
          res.json(rows);
      } catch (err) {
          res.status(500).json({ error: 'Lỗi server', details: err.message });
      }
  });
  app.get('/stats/revenue-by-date', async (req, res) => {
    try {
      const query = `
        SELECT DATE(created_at) AS date, SUM(tongtien) AS total_revenue
        FROM orders
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;
      const [rows] = await db.execute(query);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  });
  app.get('/stats/revenue-by-product', async (req, res) => {
    try {
      const query = `
        SELECT name AS product_name,
              SUM(quantity) AS total_quantity,
              SUM(price * quantity) AS total_revenue
        FROM order_items
        GROUP BY name
        ORDER BY total_revenue DESC
      `;
      const [rows] = await db.execute(query);
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  });
  app.get('/orders/status/:orderCode', async (req, res) => {
  const { orderCode } = req.params;
  try {
    const [rows] = await db.execute(
      'SELECT id_order, order_code, status, tongtien FROM orders WHERE order_code = ?',
      [orderCode]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });

    res.json({ order: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
});


  // Lấy chi tiết 1 đơn hàng theo id_order
  app.get('/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
      // Lấy thông tin đơn hàng
      const [orderRows] = await db.execute(
        'SELECT * FROM orders WHERE id_order = ?',
        [id]
      );

      if (orderRows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
      }

      const order = orderRows[0];

      // Lấy danh sách sản phẩm trong đơn
      const [itemRows] = await db.execute(
        'SELECT * FROM order_items WHERE id_order = ?',
        [id]
      );

      // Gộp lại
      order.items = itemRows;

      res.json(order);
    } catch (err) {
      res.status(500).json({ error: 'Lỗi server', details: err.message });
    }
  });
// Lấy tất cả đơn hàng của 1 khách hàng
app.get('/customers/:id/orders', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(
      'SELECT * FROM orders WHERE id_cus = ? ORDER BY created_at DESC',
      [id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
});
// Lấy chi tiết 1 đơn hàng của khách hàng
app.get('/customers/:id/orders/:orderId', async (req, res) => {
  const { id, orderId } = req.params;
  try {
    // Kiểm tra đơn có đúng thuộc về khách đó không
    const [orderRows] = await db.execute(
      'SELECT * FROM orders WHERE id_order = ? AND id_cus = ?',
      [orderId, id]
    );

    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    const order = orderRows[0];

    // Lấy danh sách sản phẩm trong đơn
    const [itemRows] = await db.execute(
      'SELECT * FROM order_items WHERE id_order = ?',
      [orderId]
    );

    order.items = itemRows;

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
});




// ========================
// 5. SALES API
// ========================
app.get('/sales', async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM sales ORDER BY created_at DESC');
        res.json(results);
    } catch (err) {
        res.status(500).json(err);
    }
});

app.post('/sales', async (req, res) => {
    const { id_order, total_amount } = req.body;
    try {
        const [result] = await db.query('INSERT INTO sales (id_order, total_amount) VALUES (?, ?)', [id_order, total_amount]);
        res.json({ id: result.insertId, id_order, total_amount });
    } catch (err) {
        res.status(500).json(err);
    }
});

// ========================
// 6. REPORTS API
// ========================
app.get('/reports', async (req, res) => {
    const type = req.query.type; // order, good, customer, user, shift
    let sql = 'SELECT * FROM reports';
    let params = [];

    if (type) {
        sql += ' WHERE type = ?';
        params.push(type);
    }

    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database query failed' });
    }
});

app.post('/reports', async (req, res) => {
    const { error_title, error_detail } = req.body;
    try {
        const [result] = await db.query('INSERT INTO reports (error_title, error_detail) VALUES (?, ?)', [error_title, error_detail]);
        res.json({ id_repo: result.insertId, error_title, error_detail });
    } catch (err) {
        res.status(500).json(err);
    }
});
// ========================
// 7. GOODS API
// ========================
app.get("/goods", async (req, res) => {
  try {
    const [goods] = await db.query(
      "SELECT * FROM goods ORDER BY created_at DESC"
    );

    const [items] = await db.query(
      `SELECT gi.*, p.name AS product_name, p.barcode
       FROM good_item gi
       JOIN products p ON gi.product_id = p.id`
    );

    const result = goods.map((g) => ({
      ...g,
      items: items.filter((i) => i.goods_id === g.id),
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi lấy danh sách goods" });
  }
});

app.post("/goods", async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { code, type, note, items } = req.body;
    if (!code || !type || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Thiếu dữ liệu" });
    }

    await conn.beginTransaction();

    const [goodRes] = await conn.query(
      "INSERT INTO goods (code, type, note, status) VALUES (?, ?, ?, 'pending')",
      [code, type, note || null]
    );
    const goodsId = goodRes.insertId;

    for (const item of items) {
      const [product] = await conn.query(
        "SELECT price FROM products WHERE id = ?",
        [item.product_id]
      );
      if (product.length === 0) {
        throw new Error(`Sản phẩm id=${item.product_id} không tồn tại`);
      }

      const productPrice = product[0].price;
      await conn.query(
        "INSERT INTO good_item (goods_id, product_id, quantity, price) VALUES (?, ?, ?, ?)",
        [goodsId, item.product_id, item.quantity, productPrice]
      );
    }

    await conn.commit();
    res.status(201).json({ message: "Tạo phiếu goods thành công", goods_id: goodsId });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "Lỗi khi tạo goods", details: err.message });
  } finally {
    conn.release();
  }
});
app.put("/goods/:id/approve", async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    // Lấy phiếu + items
    const [goods] = await conn.query("SELECT * FROM goods WHERE id = ?", [id]);
    if (goods.length === 0) {
      return res.status(404).json({ error: "Phiếu goods không tồn tại" });
    }
    if (goods[0].status === "approved") {
      return res.status(400).json({ error: "Phiếu này đã được duyệt trước đó" });
    }

    const [items] = await conn.query("SELECT * FROM good_item WHERE goods_id = ?", [id]);

    // Cập nhật tồn kho
    for (const item of items) {
      if (goods[0].type === "import") {
        await conn.query(
          "UPDATE products SET quantity = quantity + ? WHERE id = ?",
          [item.quantity, item.product_id]
        );
      } else if (goods[0].type === "export") {
        await conn.query(
          "UPDATE products SET quantity = quantity - ? WHERE id = ?",
          [item.quantity, item.product_id]
        );
      }
    }

    // Đổi trạng thái
    await conn.query("UPDATE goods SET status = 'approved' WHERE id = ?", [id]);

    await conn.commit();
    res.json({ message: "Duyệt phiếu goods thành công", goods_id: id });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: "Lỗi khi duyệt phiếu goods", details: err.message });
  } finally {
    conn.release();
  }
});
// ========================
// 9.shift
// ========================
// Mở ca
app.post("/shifts/open", async (req, res) => {
  try {
    const { user_id, opening_balance } = req.body;
    if (!user_id || !opening_balance) {
      return res.status(400).json({ error: "Thiếu dữ liệu" });
    }

    let total = 0;
    Object.entries(opening_balance).forEach(([denom, qty]) => {
      total += parseInt(denom) * parseInt(qty || 0);
    });

    const [existing] = await db.query(
      "SELECT * FROM shifts WHERE user_id=? AND status='open'",
      [user_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: "Người dùng này đã có ca đang mở" });
    }

    const [result] = await db.query(
  "INSERT INTO shifts (user_id, opening_balance, opening_total, opened_at, status) VALUES (?, ?, ?, ?, 'open')",
  [user_id, JSON.stringify(opening_balance), total, vnNow]
);

    res.json({
      message: "Mở ca thành công",
      shift_id: result.insertId,
      opening_total: total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi mở ca" });
  }
});


// Lấy ca đang mở của user
app.get("/shifts/open/current/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const [rows] = await db.query(
      "SELECT * FROM shifts WHERE user_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1",
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Không có ca đang mở" });

    const shift = rows[0];

    // ✅ Lấy tổng doanh thu hiện tại
    const [salesRows] = await db.query(
      "SELECT SUM(tongtien) AS sales_total FROM orders WHERE shift_id=?",
      [shift.id]
    );
    shift.sales_total = salesRows[0].sales_total || 0;

    res.json(shift);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi lấy ca hiện tại" });
  }
});


// Đóng ca
app.put("/shifts/:id/close", async (req, res) => {
  try {
    const { id } = req.params;
    const { closing_balance } = req.body;

    if (!closing_balance) {
      return res.status(400).json({ error: "Thiếu dữ liệu closing_balance" });
    }

    // Tính tổng tiền thực tế khi đóng ca
    let closing_total = 0;
    Object.entries(closing_balance).forEach(([denom, qty]) => {
      closing_total += parseInt(denom) * parseInt(qty || 0);
    });

    // Kiểm tra ca đang mở
    const [rows] = await db.query(
      "SELECT * FROM shifts WHERE id=? AND status='open'",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy ca đang mở" });
    }

    const shift = rows[0];

    // ✅ Tính doanh thu (tổng tiền các đơn hàng trong ca này)
    const [salesRows] = await db.query(
      "SELECT SUM(tongtien) as sales_total FROM orders WHERE shift_id = ?",
      [id]
    );
    const sales_total = salesRows[0].sales_total || 0;

    const difference = closing_total - shift.opening_total;

    // ✅ Cập nhật ca
    await db.query(
      `UPDATE shifts 
       SET closed_at=NOW(), 
           closing_balance=?, 
           closing_total=?, 
           difference=?, 
           sales_total=?, 
           status='closed' 
       WHERE id=?`,
      [JSON.stringify(closing_balance), closing_total, difference, sales_total, id]
    );

    res.json({
      message: "Đóng ca thành công",
      shift_id: id,
      closing_total,
      sales_total,
      difference
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi đóng ca" });
  }
});
// ========================
// 10. CATEGORY 
// ========================
//category
app.get("/categories", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT name_cate FROM categories");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lỗi khi lấy danh mục" });
  }
});
// ========================
// 10.PROMOTIONS
// ========================
// promotion.js hoặc trong index.js
app.get('/promotions', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM Promotion ORDER BY start_date DESC');
    res.json(results);
  } catch (err) {
    res.status(500).json(err);
  }
});
//promotion with items
app.get('/promotions-with-items', async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT 
        p.promotion_id,
        p.title,
        p.description,
        p.discount_percent,
        p.image_url,
        p.start_date,
        p.end_date,
        p.promotion_type,
        p.price_min,
        pi.product_id,
        pi.quantity AS required_quantity
      FROM Promotion p
      LEFT JOIN PromotionItem pi ON p.promotion_id = pi.promotion_id
      ORDER BY p.start_date DESC
    `);

    // Gom các promotion lại, tránh trùng lặp khi có nhiều item
    const promotions = results.reduce((acc, row) => {
      let promo = acc.find(p => p.promotion_id === row.promotion_id);
      if (!promo) {
        promo = {
          promotion_id: row.promotion_id,
          title: row.title,
          description: row.description,
          discount_percent: row.discount_percent,
          image_url: row.image_url,
          start_date: row.start_date,
          end_date: row.end_date,
          promotion_type: row.promotion_type,
          price_min: row.price_min,
          items: []
        };
        acc.push(promo);
      }
      if (row.product_id) {
        promo.items.push({
          product_id: row.product_id,
          required_quantity: row.required_quantity
        });
      }
      return acc;
    }, []);

    res.json(promotions);
  } catch (err) {
    console.error("Error fetching promotions with items:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post('/promotions', async (req, res) => {
  let conn;
  try {
    const {
      title,
      description,
      image_url,
      discount_percent,
      start_date,
      end_date,
      promotion_type = 'price',
      price_min = null,
      items = []  // [{ product_id, quantity }, ...]
    } = req.body;

    // helper: convert input (e.g. "2025-09-20" or "2025-09-20T00:00") to MySQL DATETIME
    const toSqlDatetime = (val) => {
      if (!val && val !== 0) return null;
      // if val already in "YYYY-MM-DD HH:MM:SS" keep; otherwise convert
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 19).replace('T', ' ');
    };

    const sd = toSqlDatetime(start_date);
    const ed = toSqlDatetime(end_date);

    conn = await db.getConnection(); // lấy connection từ pool
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO Promotion
       (title, description, image_url, discount_percent, start_date, end_date, promotion_type, price_min)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description,
        image_url,
        discount_percent || 0,
        sd,
        ed,
        promotion_type,
        promotion_type === 'price' ? price_min : null
      ]
    );

    const promoId = result.insertId;

    if (promotion_type === 'product' && Array.isArray(items) && items.length) {
      // prepare bulk values: [[promoId, product_id, quantity], ...]
      const vals = items.map(it => [promoId, it.product_id, it.quantity || 1]);
      // INSERT bulk (mysql2 supports VALUES ? form)
      await conn.query(
        'INSERT INTO PromotionItem (promotion_id, product_id, quantity) VALUES ?',
        [vals]
      );
    }

    await conn.commit();
    conn.release();

    // trả về promotion mới
    const [newPromotionRows] = await db.query('SELECT * FROM Promotion WHERE promotion_id = ?', [promoId]);
    res.status(201).json(newPromotionRows[0]);
  } catch (err) {
    if (conn) {
      try { await conn.rollback(); conn.release(); } catch (e) { /* ignore */ }
    }
    console.error("INSERT PROMOTION ERROR:", err);
    res.status(500).json({ error: 'Lỗi server khi thêm khuyến mãi' });
  }
});


app.get('/promotions/:promotion_id', async (req, res) => {
  try {
    const { promotion_id } = req.params;
    const [results] = await db.query('SELECT * FROM Promotion WHERE promotion_id = ?', [promotion_id]);
    if (results.length === 0) return res.status(404).json({ message: 'Promotion not found' });
    res.json(results[0]);
  } catch (err) {
    res.status(500).json(err);
  }
});

app.put('/promotions/:promotion_id', async (req, res) => {
  try {
    const { promotion_id } = req.params;
    const { title, description, image_url, discount_percent, start_date, end_date } = req.body;

    const [result] = await db.query(
      `UPDATE Promotion 
       SET title=?, description=?, image_url=?, discount_percent=?, start_date=?, end_date=? 
       WHERE promotion_id=?`,
      [title, description, image_url, discount_percent, start_date, end_date, promotion_id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Không tìm thấy khuyến mãi để cập nhật" });
    }

    const [updated] = await db.query(
      'SELECT * FROM Promotion WHERE promotion_id = ?',
      [promotion_id]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ error: "Lỗi server khi cập nhật khuyến mãi" });
  }
});


app.delete('/promotions/:promotion_id', async (req, res) => {
  try {
    const { promotion_id } = req.params;
    await db.query('DELETE FROM Promotion WHERE promotion_id = ?', [promotion_id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json(err);
  }
});
//sepay
app.get("/orders/status/:orderCode", async (req, res) => {
  const { orderCode } = req.params;
  const [rows] = await db.query(
    "SELECT order_code, status FROM orders WHERE order_code = ?",
    [orderCode]
  );

  if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

  res.json({ order_code: orderCode, status: rows[0].status });
});
app.put("/orders/paid/:orderCode", async (req, res) => {
  
  const { orderCode } = req.params;
  const { selectMail = null } = req.body || {};

  try {
    const [result] = await db.execute(
      'UPDATE orders SET status = ? WHERE order_code = ?',
      ['paid', orderCode]
    );
    
    if (selectMail) {
      try {
        await axios.post(`http://localhost:3000/send-invoice/${orderCode}`, { selectMail });
      } catch (mailErr) {
        console.error("❌ Lỗi khi gửi mail:", mailErr.message);
      }
    }


    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    console.log(`[ORDER PAID] Order ${orderCode} đã thanh toán thành công`);
    res.json({ order_code: orderCode, status: "paid" });
  } catch (err) {
    console.error("Cannot update database:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.post('/orders/cancel/:orderCode', async (req, res) => {
  const { orderCode } = req.params;
  try {
    // Lấy đơn hàng
    const [orders] = await db.execute(
      'SELECT * FROM orders WHERE order_code = ?',
      [orderCode]
    );

    if (orders.length === 0) return res.status(404).json({ error: 'Đơn hàng không tồn tại' });

    const order = orders[0];

    // Kiểm tra trạng thái và thời gian
    const orderTime = new Date(order.created_at);
    const now = new Date();
    const diffSeconds = (now - orderTime) / 1000;

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Chỉ hủy được đơn pending' });
    }
    if (diffSeconds > 60) {
      return res.status(400).json({ error: 'Quá 1 phút, không thể hoàn hàng tự động' });
    }

    // Lấy các sản phẩm trong đơn
    const [items] = await db.execute(
      'SELECT * FROM order_items WHERE id_order = ?',
      [order.id_order]
    );

    // Hoàn lại số lượng hàng trong bảng products
    for (const item of items) {
      await db.execute(
        'UPDATE products SET quantity = quantity + ? WHERE name = ?',
        [item.quantity, item.name]
      );
    }

    // Cập nhật trạng thái đơn
    await db.execute(
      'UPDATE orders SET status = ? WHERE id_order = ?',
      ['cancelled', order.id_order]
    );

    res.json({ success: true, message: 'Đơn hàng đã được hủy và hàng hoàn lại kho' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/orders/cancel-pending', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id_order, order_code, created_at 
       FROM orders 
       WHERE status = 'pending' 
         AND order_code IS NOT NULL`
    );

    const now = new Date();
    const toCancel = rows.filter(order => {
      const createdAt = new Date(order.created_at);
      return (now - createdAt) / 1000 > 30; // quá 30s
    });

    if (toCancel.length === 0) {
      return res.json({ message: 'Không có đơn hàng pending nào cần hủy' });
    }

    // Hủy đơn và hoàn lại số lượng hàng
    for (const order of toCancel) {
      await db.execute(
        `UPDATE products p
         JOIN order_items oi ON oi.id_item = p.id
         SET p.quantity = p.quantity + oi.quantity
         WHERE oi.id_order = ?`,
        [order.id_order]
      );

      await db.execute(
        `UPDATE orders SET status = 'cancelled' WHERE id_order = ?`,
        [order.id_order]
      );
    }

    res.json({ message: `Đã hủy ${toCancel.length} đơn hàng pending` });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
});
const cancelPendingOrders = async () => {
  try {
    const [rows] = await db.execute(
      `SELECT id_order, order_code, created_at 
       FROM orders 
       WHERE status = 'pending' 
         AND order_code IS NOT NULL`
    );

    const now = new Date();
    const toCancel = rows.filter(order => {
      const createdAt = new Date(order.created_at);
      return (now - createdAt) / 1000 > 30; // quá 30s
    });

    for (const order of toCancel) {
      // Hoàn lại số lượng sản phẩm
      await db.execute(
        `UPDATE products p
         JOIN order_items oi ON oi.id_item = p.id
         SET p.quantity = p.quantity + oi.quantity
         WHERE oi.id_order = ?`,
        [order.id_order]
      );

      // Cập nhật trạng thái hủy
      await db.execute(
        `UPDATE orders SET status = 'cancelled' WHERE id_order = ?`,
        [order.id_order]
      );
    }

    if (toCancel.length > 0) {
      console.log(`Đã hủy ${toCancel.length} đơn hàng pending`);
    }
  } catch (err) {
    console.error('Lỗi khi hủy pending orders:', err.message);
  }
};
setInterval(cancelPendingOrders, 300000); // 300000ms = 5 phút
// ========================
// 11. SEND EMAIL
// ========================
app.post('/send-invoice/:orderCode', async (req, res) => {
  const { orderCode } = req.params;
  const overrideEmail = req.body?.email;

  try {
    // Lấy order
    const [orderRows] = await db.execute('SELECT * FROM orders WHERE order_code=?', [orderCode]);
    if (!orderRows.length) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    const order = orderRows[0];

    // Lấy items
    const [itemsRows] = await db.execute('SELECT * FROM order_items WHERE id_order=?', [order.id_order]);

    // Lấy email khách hàng
    let customerEmail = overrideEmail || null;
    if (!customerEmail && order.id_cus) {
      const [cusRows] = await db.execute('SELECT email FROM customers WHERE id_cus=?', [order.id_cus]);
      if (cusRows.length && cusRows[0].email) customerEmail = cusRows[0].email;
    }
    if (!customerEmail) return res.status(400).json({ error: 'Không có email khách hàng' });

    // Gửi mail
    await sendMail(customerEmail, { type: 'invoice', order, items: itemsRows });

    return res.json({ message: 'Đã gửi hóa đơn thành công', order, items: itemsRows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi server', details: err.message });
  }
});
//OTP
app.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Thiếu email' });

  const otpCode = Math.floor(100000 + Math.random() * 900000); // 6 chữ số

  try {
    await sendMail(email, { type: 'otp', otpCode, subject: 'Mã xác thực DuckBunn Store' });
    return res.json({ message: 'Đã gửi mã xác thực', otpCode }); // otpCode có thể không trả về trong thực tế, chỉ log
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Lỗi gửi mail', details: err.message });
  }
});




// ========================
// Start server
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
// ========================
// Start server
// ========================
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
