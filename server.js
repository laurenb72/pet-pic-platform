const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 8080;

// serve everything in this folder (index.html, CSS, JS, images)
app.use(express.static(path.join(__dirname)));

app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => console.log("Server running on", PORT));
