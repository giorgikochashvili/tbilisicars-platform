import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  console.warn("⚠️  PORT not set — defaulting to 5000");
}

const port = Number(rawPort ?? "5000");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const resendKey = process.env["RESEND_API_KEY"];
if (!resendKey || resendKey.trim() === "") {
  console.warn("⚠️  RESEND_API_KEY is not set — email sending is disabled.");
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
