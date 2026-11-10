import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Kullanım: npx tsx scripts/hash-password.ts <şifre>");
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  const base64 = Buffer.from(hash, "utf-8").toString("base64");
  console.log("DEMO_ADMIN_PASSWORD_HASH_B64=" + base64);
});
