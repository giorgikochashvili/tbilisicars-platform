import app from "./app";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const resendKey = process.env["RESEND_API_KEY"];
if (!resendKey || resendKey.trim() === "") {
  console.error("❌ RESEND_API_KEY is missing or empty. Email service cannot function. Exiting.");
  process.exit(1);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
