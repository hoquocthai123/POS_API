// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3008;
const axios = require('axios');
app.use(cors());
app.use(bodyParser.json());



const orders = {};

// POST /orders – tạo đơn
app.post("/orders", (req, res) => {
  const data = req.body;
  if (!data) return res.status(400).json({ error: "Missing payload" });

  const orderCode = data.order_code || `DH${Date.now()}`;
  orders[orderCode] = {
    ...data,
    order_code: orderCode,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  console.log("======================================");
  console.log(`[NEW ORDER] Code: ${orderCode}`);
  console.log("Items:", data.items);
  console.log("Payment method:", data.payment_method);
  console.log("Total amount:", data.tongtien);
  console.log("Customer:", data.id_cus || "Khách lẻ");
  console.log("======================================");

  res.json({ order_code: orderCode, status: "pending" });
});

app.post("/api/sepay-webhook", async (req, res) => {
  try {
    console.log("Webhook hit!");
    const data = req.body;
    console.log("Webhook received:", data);

    if (!data.content) {
      console.warn("Missing content in webhook");
      return res.status(400).json({ error: "Missing content" });
    }

    // Parse order code, ví dụ 'IBFT DH17582939633062'
    const match = data.content.match(/DH\d+/);
    const orderCode = match ? match[0] : null;

    if (!orderCode) {
      console.warn("Cannot parse order code from content:", data.content);
      return res.status(400).json({ error: "Cannot parse order code" });
    }

    console.log("Parsed order code:", orderCode);

    // Gọi API /orders/paid/:orderCode trên port 3000
    try {
      const response = await axios.put(`http://localhost:3000/orders/paid/${orderCode}`);
      console.log("Order updated successfully:", response.data);
    } catch (axiosErr) {
      console.error("Error updating order status:", axiosErr.message);
      return res.status(500).json({ error: "Failed to update order status" });
    }

    res.json({ success: true, order_code: orderCode });
  } catch (err) {
    console.error("Webhook processing error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});








app.listen(PORT, () => {
  console.log(`Mock POS backend running on http://localhost:${PORT}`);
});
