/**
 * Điểm vào ứng dụng API.
 * Tạo Express app rồi lắng nghe cổng từ biến môi trường.
 */
import { createApp } from "./app.js";
import { env } from "./lib/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});
