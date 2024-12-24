import express from "express";

const app = express();

const router = express.Router();
const routes = await import("./router.js");
routes.bindToRouter(router);

app.use(router);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
